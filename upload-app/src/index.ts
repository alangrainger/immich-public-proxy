#!/usr/bin/env node

import 'dotenv/config'
import express, { RequestHandler, Router } from 'express'
import { Request } from 'express-serve-static-core'
import { resolve } from 'path'
import dayjs from 'dayjs'
import { h } from 'preact'
import {
  addNoStoreHeaders,
  asyncHandler,
  CORE_PUBLIC_DIR,
  decodeCookie,
  enforceMinimumImmichVersion,
  errorHandler,
  getKeyTypeFromShare,
  healthcheck,
  invalidPasswordResponse,
  isKey,
  KeyType,
  loadConfig,
  Password,
  renderPage,
  respondToInvalidRequest,
  sessionMiddleware,
  SharedLink,
  slugLinksDisabled,
  title,
  unlockHandler
} from '@ipp/core'
import { galleryUrl, maxFileSize } from './config'
import { uploadAllowed } from './gate'
import { createUploadReceiver } from './receive'
import { getShare } from './share'
import { ASSET_VERSION } from './version'
import { UploadPage } from './view/upload'

/*
  Must run before any code that calls getConfigOption. The bundled
  config.json sits one level above this file, which is /app/config.json in
  the image.
*/
loadConfig({ defaultPath: resolve(__dirname, '../config.json') })

const receiveUpload = createUploadReceiver()
const inProduction = process.env.NODE_ENV === 'production'

const app = express()
app.disable('x-powered-by')

/*
  The server has no whole-request timeout (see `requestTimeout` at the end),
  so nothing else stops a sender trickling a body to a route that has already
  answered. A request that carries a body closes its connection once the
  response is sent, read or not. Each upload is its own request, so no
  visitor loses a connection worth keeping.
*/
app.use((req, res, next) => {
  if (req.headers['content-length'] || req.headers['transfer-encoding']) res.set('Connection', 'close')
  next()
})

/**
 * Drop a request that has no response within `ms`. For a route that reads
 * its body before answering: with no whole-request timeout, a slow sender
 * would otherwise hold it open forever.
 */
function bodyDeadline (ms: number): RequestHandler {
  return (req, res, next) => {
    const timer = setTimeout(() => req.destroy(), ms)
    res.once('close', () => clearTimeout(timer))
    next()
  }
}

/*
  [ROUTE] Healthcheck, reachable at the root whatever the mount prefix, so one
  compose healthcheck fits both routing shapes.
*/
app.get(['/healthcheck', '/share/healthcheck'], (_req, res, next) => {
  addNoStoreHeaders(res)
  next()
}, asyncHandler(healthcheck))

const router = Router()

for (const dir of ['public', CORE_PUBLIC_DIR]) {
  router.use('/share/static/' + ASSET_VERSION, express.static(dir, { immutable: inProduction, maxAge: inProduction ? '365d' : 0 }))
  router.use('/share/static', express.static(dir))
}

// Everything past the static assets is never cached, and no page may be framed
router.use((_req, res, next) => {
  addNoStoreHeaders(res)
  res.set('X-Frame-Options', 'DENY')
  res.set('Content-Security-Policy', "frame-ancestors 'none'")
  next()
})
router.use(sessionMiddleware({ name: 'upload-session' }))

/*
  [ROUTE] Healthcheck under the mount prefix. Before the share routes, which
  would otherwise read "healthcheck" as a key
*/
router.get(['/healthcheck', '/share/healthcheck'], asyncHandler(healthcheck))

type ShareResolution =
  | { ok: true, link: SharedLink, keyType: KeyType }
  | { ok: false, reason: string, passwordRequired?: boolean }

/** Validate the share in the URL against Immich, with the password from the session cookie. */
async function resolveShare (req: Request): Promise<ShareResolution> {
  const keyType = getKeyTypeFromShare(req.params.shareType)
  if (slugLinksDisabled(keyType)) return { ok: false, reason: 'Slug links are disabled in config.json' }
  if (!isKey(req.params.key)) return { ok: false, reason: 'Invalid key for ' + req.path }
  const share = await getShare(req.params.key, keyType, req.password)
  if (!share.valid) return { ok: false, reason: 'Invalid share link' }
  if (share.passwordRequired || !share.link) return { ok: false, reason: 'Password required', passwordRequired: true }
  return { ok: true, link: share.link, keyType }
}

/*
  [ROUTE] Upload page, or the password page for a locked share
*/
router.get('/:shareType(share|s)/:key', decodeCookie, asyncHandler(async (req, res) => {
  const key = req.params.key
  const resolved = await resolveShare(req)
  if (!resolved.ok && resolved.passwordRequired) {
    if (req.password) invalidPasswordResponse(req, res, key)
    res.send(renderPage(h(Password, { shareKey: key, notifyInvalidPassword: !!req.password, basePath: req.baseUrl })))
    return
  }
  if (!resolved.ok || !uploadAllowed(resolved.link, resolved.keyType)) {
    respondToInvalidRequest(res, 404, resolved.ok ? 'Share does not accept uploads' : resolved.reason)
    return
  }
  const gallery = galleryUrl()
  res.send(renderPage(h(UploadPage, {
    config: {
      uploadUrl: `${req.baseUrl}/${req.params.shareType}/${encodeURIComponent(key)}/upload`,
      maxFileSize: maxFileSize(),
      title: title(resolved.link)
    },
    basePath: req.baseUrl,
    galleryLink: gallery && `${gallery}/${req.params.shareType}/${encodeURIComponent(key)}`
  })))
}))

/*
  [ROUTE] Password unlock from the password page
*/
router.post('/share/unlock', bodyDeadline(10_000), express.json({ limit: '10kb' }), unlockHandler)

/*
  [ROUTE] One file from a visitor, streamed to Immich
*/
router.post('/:shareType(share|s)/:key/upload', decodeCookie, asyncHandler(async (req, res) => {
  const resolved = await resolveShare(req)
  if (!resolved.ok) {
    respondToInvalidRequest(res, 404, resolved.reason)
    return
  }
  await receiveUpload(req, res, resolved.link, resolved.keyType)
}))

/*
  The same routes under `/upload` and at the root, so either reverse proxy
  shape works with no URL configuration: a hostname of its own forwards
  `/share/<key>`, a path on the IPP hostname forwards `/upload/share/<key>`.
  Handlers read the prefix they were reached by from `req.baseUrl`.
*/
app.use('/upload', router)
app.use('/', router)

/*
  [ROUTE] Everything else, including `/`, gets the 404 policy
*/
app.all('*', (req, res) => {
  addNoStoreHeaders(res)
  respondToInvalidRequest(res, 404, 'Invalid route ' + req.path)
})

app.use(errorHandler)

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error', err)
  server.close()
  process.exit(1)
})
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Gracefully shutting down...')
  server.close()
  process.exit(0)
})

const port = Number(process.env.IPP_PORT) || 3000
const server = app.listen(port, () => {
  console.log(dayjs().format() + ' Upload service started on port ' + port)
  enforceMinimumImmichVersion().catch(() => {})
})
/*
  A large video on a phone uplink outlasts any whole-request limit; the body
  has an idle timeout instead, and the connection rules at the top of this
  file cover every other route
*/
server.requestTimeout = 0
