#!/usr/bin/env node

import express from 'express'
import cookieSession from 'cookie-session'
import immich from './immich'
import crypto from 'crypto'
import render from './render'
import dayjs from 'dayjs'
import { Request, Response, NextFunction } from 'express-serve-static-core'
import { AssetType, ImageSize } from './types'
import { log, toString, addResponseHeaders, getConfigOption } from './functions'
import { decrypt, encrypt } from './encrypt'

// Extend the Request type with a `password` property
declare module 'express-serve-static-core' {
  interface Request {
    password?: string;
  }
}

require('dotenv').config()

const app = express()
app.use(cookieSession({
  name: 'session',
  httpOnly: true,
  sameSite: 'strict',
  secret: crypto.randomBytes(32).toString('base64url')
}))
// Add the EJS view engine, to render the gallery page
app.set('view engine', 'ejs')
// For parsing the password unlock form
app.use(express.json())
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
  if (await immich.accessible()) {
    res.send('ok')
  } else {
    res.status(503).send()
  }
})

/*
 * [ROUTE] This is the main URL that someone would visit if they are opening a shared link
 */
app.get('/share/:key/:mode(download)?', decodeCookie, async (req, res) => {
  await immich.handleShareRequest({
    req,
    key: req.params.key,
    mode: req.params.mode,
    password: req.password
  }, res)
})

/*
 * [ROUTE] Receive an unlock request from the password page
 * Stores a cookie with an encrypted payload which expires in 1 hour.
 * After that time, the visitor will need to provide the password again.
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
 * [ROUTE] This is the direct link to a photo or video asset
 */
app.get('/share/:type(photo|video)/:key/:id/:size?', decodeCookie, async (req, res) => {
  // Add the headers configured in config.json (most likely `cache-control`)
  addResponseHeaders(res)

  // Check for valid key and ID
  if (!immich.isKey(req.params.key) || !immich.isId(req.params.id)) {
    log('Invalid key or ID for ' + req.path)
    if (getConfigOption('ipp.stealthMode', true)) {
      res.destroy();
    }
    res.status(404).send()
    return
  }

  // Validate the size parameter
  if (req.params.size && !Object.values(ImageSize).includes(req.params.size as ImageSize)) {
    log('Invalid size parameter ' + req.path)
    if (getConfigOption('ipp.stealthMode', true)) {
      res.destroy();
    }
    res.status(404).send()
    return
  }

  // Fetch the shared link information from Immich, so we can check to make sure that the requested asset
  // is allowed by this shared link.
  const sharedLink = (await immich.getShareByKey(req.params.key, req.password))?.link
  const request = {
    req,
    key: req.params.key,
    range: req.headers.range || ''
  }
  if (sharedLink?.assets.length) {
    // Check that the requested asset exists in this share
    const asset = sharedLink.assets.find(x => x.id === req.params.id)
    if (asset) {
      asset.type = req.params.type === 'video' ? AssetType.video : AssetType.image
      render.assetBuffer(request, res, asset, req.params.size).then()
    }
  } else {
    log('No asset found for ' + req.path)
    if (getConfigOption('ipp.stealthMode', true)) {
      res.destroy();
    }
    res.status(404).send()
  }
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
    res.render('home')
  })
}

/*
 * Send a 404 for all other routes
 */
app.get('*', (req, res) => {
  log('Invalid route ' + req.path)
  if (getConfigOption('ipp.stealthMode', true)) {
    res.destroy(); 
  }
  res.status(404).send()
})

// Start the ExpressJS server
const port = process.env.IPP_PORT || 3000
app.listen(port, () => {
  console.log(dayjs().format() + ' Server started on port ' + port)
})
