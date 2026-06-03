#!/usr/bin/env node

import 'dotenv/config'
import express from 'express'
import cookieSession from 'cookie-session'
import {
  accessible,
  getKeyTypeFromShare,
  getShareByKey,
  handleShareRequest,
  isId,
  isKey
} from './immich'
import crypto from 'crypto'
import { assetBuffer } from './stream/asset'
import { downloadAssets } from './stream/download'
import dayjs from 'dayjs'
import { NextFunction, Request, Response } from 'express-serve-static-core'
import { Asset, AssetType, ImageSize, KeyType } from './types'
import { getConfigOption } from './config/access'
import { loadConfig } from './config/loader'
import { addResponseHeaders } from './http'
import { canDownload } from './share'
import { toString } from './utils/text'
import { decrypt, encrypt } from './encrypt'
import { respondToInvalidRequest } from './invalidRequestHandler'
import { h } from 'preact'
import { renderPage } from './view/render'
import { Home } from './view/home'

// Extend the Request type with a `password` property
declare module 'express-serve-static-core' {
  interface Request {
    password?: string;
  }
}

// Read config.json (or the inline CONFIG env var) and apply backward-compat
// migrations. Must run before any code that calls getConfigOption.
loadConfig()

const app = express()
app.use(cookieSession({
  name: 'session',
  httpOnly: true,
  sameSite: 'lax',
  secret: crypto.randomBytes(32).toString('base64url')
}))
// For parsing the password unlock form and POSTed JSON payloads
app.use(express.json())
// For parsing the selective-download form POST (form-encoded body)
app.use(express.urlencoded({ extended: false, limit: '1mb' }))
// Serve static assets from the 'public' folder as /share/static
app.use('/share/static', express.static('public', { setHeaders: addResponseHeaders }))
// Serve the same assets on /, to allow for /robots.txt and /favicon.ico
app.use(express.static('public', { setHeaders: addResponseHeaders }))
// Remove the X-Powered-By ExpressJS header
app.disable('x-powered-by')

/**
 * Middleware to decode the encrypted data stored in the session cookie
 */
const decodeCookie = (req: Request, _res: Response, next: NextFunction) => {
  const shareKey = req.params.key
  const session = req.session?.[shareKey]
  if (shareKey && session?.iv && session?.cr) {
    try {
      const payload = JSON.parse(decrypt({
        iv: toString(session.iv),
        cr: toString(session.cr)
      }))
      if (payload?.expires && dayjs(payload.expires) > dayjs()) {
        req.password = payload.password
      }
    } catch (e) { }
  }
  next()
}

/*
 * [ROUTE] Healthcheck
 * The path matches for /share/healthcheck, and also the legacy /healthcheck
 */
app.get(/^(|\/share)\/healthcheck$/, async (_req, res) => {
  if (await accessible()) {
    res.send('ok')
  } else {
    res.status(503).send()
  }
})

/*
 * [ROUTE] This is the main URL that someone would visit if they are opening a shared link
 */
app.get('/:shareType(share|s)/:key/:mode(download)?', decodeCookie, async (req, res) => {
  const keyType = getKeyTypeFromShare(req.params.shareType)

  if (keyType === KeyType.slug && !getConfigOption('ipp.allowSlugLinks', true)) {
    // Slug type links are not allowed
    respondToInvalidRequest(res, 404, 'Slug links are disabled in config.json')
  } else {
    await handleShareRequest({
      req,
      key: req.params.key,
      keyType,
      mode: req.params.mode,
      password: req.password
    }, res)
  }
})

/*
 * [ROUTE] Receive an unlock request from the password page
 * Stores a cookie with an encrypted payload which expires in 1 hour.
 * After that time, the visitor will need to provide the password again.
 *
 * The data is encrypted/decrypted on the server as a db-less way of
 * managing user session data. The data is provided to the server by the
 * user's browser in its encrypted state.
 */
app.post('/share/unlock', async (req, res) => {
  if (req.session && req.body.key) {
    req.session[req.body.key] = encrypt(JSON.stringify({
      password: req.body.password,
      expires: dayjs().add(1, 'hour').format()
    }))
  }
  res.send()
})

/*
 * [ROUTE] Selective download - POST a list of asset IDs, get a zip of just those.
 * The list arrives as a single "assets" form field containing a JSON array.
 * Validates each ID against share.assets so the request can't pull anything
 * outside the share.
 */
app.post('/:shareType(share|s)/:key/download', decodeCookie, async (req, res) => {
  const keyType = getKeyTypeFromShare(req.params.shareType)
  let requestedIds: unknown
  try {
    requestedIds = JSON.parse(String(req.body?.assets ?? '[]'))
  } catch (e) {
    respondToInvalidRequest(res, 400, 'Malformed assets list')
    return
  }
  if (!Array.isArray(requestedIds) || requestedIds.length === 0) {
    respondToInvalidRequest(res, 400, 'No assets selected')
    return
  }

  const result = await getShareByKey(req.params.key, req.password, keyType)
  if (!result?.valid || !result.link) {
    respondToInvalidRequest(res, 404, 'Invalid share link')
    return
  }
  if (result.passwordRequired) {
    respondToInvalidRequest(res, 401, 'Password required')
    return
  }
  if (!canDownload(result.link)) {
    respondToInvalidRequest(res, 403, 'Downloads disabled for this share')
    return
  }

  const requested = new Set(requestedIds.map(String))
  const validAssets = result.link.assets.filter(a => requested.has(a.id))
  if (validAssets.length === 0) {
    respondToInvalidRequest(res, 400, 'No valid assets in selection')
    return
  }

  await downloadAssets(res, result.link, validAssets)
})

/*
 * [ROUTE] Catch accidental POST requests to share URLs (e.g. from browser history
 * state issues) and force a clean GET redirect.
 * See https://github.com/alangrainger/immich-public-proxy/pull/205
 */
app.post('/:shareType(share|s)/:key/:mode(download)?', (req, res) => {
  res.redirect(303, req.originalUrl)
})

/*
 * [ROUTE] This is the direct link to a photo or video asset
 */
app.get('/share/:type(photo|video)/:key/:id/:size?', decodeCookie, async (req, res) => {
  // Add the headers configured in config.json (most likely `cache-control`)
  addResponseHeaders(res)

  // Check for valid key and ID
  if (!isKey(req.params.key) || !isId(req.params.id)) {
    respondToInvalidRequest(res, 404, 'Invalid key or ID for ' + req.path)
    return
  }

  // Validate the size parameter
  if (req.params.size && !Object.values(ImageSize).includes(req.params.size as ImageSize)) {
    respondToInvalidRequest(res, 404, 'Invalid size parameter ' + req.path)
    return
  }

  // Validate share link and check password before serving assets
  // This prevents direct URL access from bypassing password protection
  // The password is provided from the encrypted session cookie (if set)
  const share = await getShareByKey(req.params.key, req.password)
  if (!share) {
    respondToInvalidRequest(res, 404, 'Invalid share link')
    return
  }

  // If password is required but not provided, redirect to the share page
  if (share.passwordRequired) {
    res.redirect('/share/' + req.params.key)
    return
  }

  // Find the real asset on the share so assetBuffer has access to
  // originalMimeType and originalFileName (needed for Content-Disposition and
  // for requiresOriginal to recognise videos/animated images and bypass the
  // preview downgrade). Doubles as the "belongs to this share" check.
  const realAsset = share.link?.assets?.find(a => a.id === req.params.id)
  if (!realAsset) {
    respondToInvalidRequest(res, 404, 'Asset not found in share')
    return
  }
  const asset: Asset = {
    ...realAsset,
    type: req.params.type === 'video' ? AssetType.video : AssetType.image
  }

  const request = {
    req,
    key: req.params.key,
    range: req.headers.range || ''
  }
  assetBuffer(request, res, asset, req.params.size).then()
})

/*
 * [ROUTE] Home page
 *
 * It was requested here to have *something* on the home page:
 * https://github.com/alangrainger/immich-public-proxy/discussions/19
 *
 * If you don't want to see this, set showHomePage as false in your config.json:
 * https://github.com/alangrainger/immich-public-proxy?tab=readme-ov-file#immich-public-proxy-options
 */
if (getConfigOption('ipp.showHomePage', true)) {
  app.get(/^\/(|share)\/*$/, (_req, res) => {
    addResponseHeaders(res)
    res.send(renderPage(h(Home, {})))
  })
}

/*
 * Send a 404 for all other routes
 */
app.get('*', (req, res) => {
  respondToInvalidRequest(res, 404, 'Invalid route ' + req.path)
})

// Send the correct process error code for any uncaught exceptions
// so that Docker can gracefully restart the container
process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error', err)
  server.close()
  process.exit(1)
})
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  server.close()
  process.exit(1)
})
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Gracefully shutting down...')
  server.close()
  process.exit(0)
})

// Start the ExpressJS server
const port = Number(process.env.IPP_PORT) || 3000
const server = app.listen(port, () => {
  console.log(dayjs().format() + ' Server started on port ' + port)
})
