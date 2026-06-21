import {
  Album,
  AlbumType,
  Asset,
  AssetType,
  ImageSize,
  IncomingShareRequest,
  KeyType,
  SharedLink,
  SharedLinkResult
} from './types'
import dayjs from 'dayjs'
import { getConfigOption } from './config/access'
import { addResponseHeaders } from './http'
import { canDownloadAll } from './share'
import { log } from './utils/log'
import { assetBuffer } from './stream/asset'
import { downloadAll } from './stream/download'
import { gallery } from './gallery/builder'
import { Response } from 'express-serve-static-core'
import { h } from 'preact'
import { renderPage } from './view/render'
import { Password } from './view/password'
import { respondToInvalidRequest } from './invalidRequestHandler'
import { encrypt } from './encrypt'
import { TtlLruCache } from './utils/ttlLruCache'

/*
  In-process cache for share-link lookups. Each direct-asset request (e.g.
  `/share/photo/:key/:id/thumbnail`) re-validates the share by calling
  getShareByKey, which for album shares also pulls the entire album asset
  list from Immich. Without this cache, a gallery view of N tiles fans out
  into N concurrent full-album fetches against Immich and serializes there,
  pushing per-thumbnail latency into seconds. The cache holds Promises
  (not resolved values) so concurrent cold misses coalesce into one upstream
  call instead of stampeding.

  CAUTION: a cache hit returns the SAME SharedLinkResult reference across
  requests. Callers MUST treat the result (and its `link.assets`) as
  read-only. In-place mutation persists for the cache lifetime and leaks
  across concurrent requests. Current callers (notably the in-place
  `share.assets.sort(...)` in render.ts) happen to be idempotent so this is
  safe today, but new callers should clone before mutating.
*/
const shareCache = new TtlLruCache<Promise<SharedLinkResult>>({ ttlMs: 120_000, max: 100 })

/*
  Immich replaced the deprecated `?password=...` query-param auth for shared
  links with `POST /shared-links/login`, which returns an
  `immich_shared_link_token` cookie used on subsequent calls. This cache holds
  one such token per (keyType, key, password) so the gallery's many asset
  requests reuse a single login round-trip. Keying by password is load-bearing
  for security: a request without the correct password produces a different
  cache key (often empty) and falls through to a fresh login that Immich will
  reject - IPP never serves cached tokens to unauthenticated visitors.
*/
const tokenCache = new TtlLruCache<Promise<string | null>>({ ttlMs: 120_000, max: 100 })

/**
 * Make a request to Immich API. We're not using the SDK to limit
 * the possible attack surface of this app.
 */
export async function request (endpoint: string, init?: RequestInit) {
  try {
    const res = await fetch(apiUrl() + endpoint, init)
    if (res.status === 200) {
      const contentType = res.headers.get('Content-Type') || ''
      if (contentType.includes('application/json')) {
        return res.json()
      } else {
        return res
      }
    } else {
      log('Immich API status ' + res.status)
      console.log(await res.text())
    }
  } catch (e) {
    log('Unable to reach Immich on ' + process.env.IMMICH_URL)
    log(`From the server IPP is running on, see if you can curl to ${apiUrl()}/server/ping and receive a JSON result.`)
  }
}

export function apiUrl () {
  return (process.env.IMMICH_URL || '').replace(/\/*$/, '') + '/api'
}

/**
 * Handle an incoming request for a shared link `key`. This is the main function which
 * communicates with Immich and returns the output back to the visitor.
 *
 * Possible HTTP responses are:
 *
 * 200 - either a photo gallery or the unlock page.
 * 401 - the visitor provided a password but it was invalid.
 * 404 - any other failed request. Check console.log for details.
 */
export async function handleShareRequest (req: IncomingShareRequest, res: Response) {
  addResponseHeaders(res)

  // Check that the key is a valid format
  if (!isKey(req.key)) {
    respondToInvalidRequest(res, 404, 'Wrong key format ' + req.key)
    return
  }

  // Get information about the shared link via Immich API
  const sharedLinkRes = await getShareByKey(req.key, req.password, req.keyType || KeyType.key)
  if (!sharedLinkRes.valid) {
    // This isn't a valid request - check the console for more information
    respondToInvalidRequest(res, 404, 'Invalid request')
    return
  }

  // A password is required, but the visitor-provided one doesn't match
  if (sharedLinkRes.passwordRequired && req.password) {
    log('Invalid password for key ' + req.key)
    res.status(401)
    // Delete the cookie-session data, so that it doesn't keep saying "Invalid password"
    if (req.req?.session) delete req.req.session[req.key]
  }

  // Don't cache password-protected albums
  if (sharedLinkRes.passwordRequired || req.password) {
    res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.header('Pragma', 'no-cache')
    res.header('Expires', '0')
  }

  // Password required - show the visitor the password page
  if (sharedLinkRes.passwordRequired) {
    // `req.key` is already sanitised at this point, but it never hurts to be explicit
    const shareKey = req.key.replace(/[^\w-]/g, '')
    res.send(renderPage(h(Password, {
      shareKey,
      notifyInvalidPassword: !!req.password
    })))
    return
  }

  if (!sharedLinkRes.link) {
    respondToInvalidRequest(res, 404, 'Unknown error with key ' + req.key)
    return
  }
  const link = sharedLinkRes.link

  // If this was a password-protected slug link, we need to also store session information for the ID-based key
  if (req.password && req.req.session && !req.req.session[link.key]) {
    req.req.session[link.key] = encrypt(JSON.stringify({
      password: req.password,
      expires: dayjs().add(1, 'hour').format()
    }))
  }

  // Everything is ok - output the shared link data

  if (req.mode === 'download' && canDownloadAll(link)) {
    // Download all assets as a zip file
    await downloadAll(res, link)
  } else if (link.assets.length === 1) {
    // This is an individual item (not a gallery)
    log('Serving link ' + req.key)
    const asset = link.assets[0]
    if (asset.type === AssetType.image && !getConfigOption('ipp.gallery.singleImage') && !req.password) {
      // For photos, output the image directly unless configured to show a gallery,
      // or unless it's a password-protected link
      await assetBuffer(req, res, link.assets[0], ImageSize.preview)
    } else {
      // Show a gallery page
      const openItem = getConfigOption('ipp.gallery.singleItemAutoOpen', true) ? 1 : 0
      await gallery(res, link, openItem)
    }
  } else {
    // Multiple images - render as a gallery
    log('Serving link ' + req.key)
    await gallery(res, link)
  }
}

/**
 * Query Immich for the SharedLink metadata for a given key, with a short
 * in-process cache + in-flight de-duplication. See the cache notes at the
 * top of this file for the why.
 *
 * The cache holds the full post-album-population SharedLinkResult, so warm
 * hits skip both the `/shared-links/me` and `/albums/:id` round trips.
 * Negative results (`valid: false`) and rejections are dropped from the
 * cache immediately so a transient Immich blip doesn't poison the cache.
 */
export async function getShareByKey (key: string, password?: string, keyType: KeyType = KeyType.key): Promise<SharedLinkResult> {
  const cacheKey = `${keyType}:${key}:${password ?? ''}`
  const cached = shareCache.get(cacheKey)
  if (cached) return cached

  const promise = fetchShareByKey(key, password, keyType)
  shareCache.set(cacheKey, promise)
  promise.then(
    (result) => { if (!result?.valid) shareCache.delete(cacheKey) },
    () => { shareCache.delete(cacheKey) }
  )
  return promise
}

/**
 * Underlying fetch for getShareByKey. Always hits Immich; the public
 * getShareByKey wraps this with the cache. Don't call this directly from
 * outside the module - going through getShareByKey is what gives us the
 * coalescing on cold misses.
 */
async function fetchShareByKey (key: string, password?: string, keyType: KeyType = KeyType.key): Promise<SharedLinkResult> {
  let link
  const url = buildUrl(apiUrl() + '/shared-links/me', {
    [keyType]: key
  })
  const headers = await authHeaders(keyType, key, password)
  const res = await fetch(url, { headers })
  if ((res.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    const jsonBody = await res.json()
    if (jsonBody) {
      if (res.status === 200) {
        // Normal response - get the shared assets
        link = jsonBody as SharedLink
        link.keyType = keyType

        // For an album, we need to make a second request to Immich to populate
        // the array of assets
        if (link.type === AlbumType.album) {
          const albumRes = await fetch(buildUrl(apiUrl() + '/albums/' + link?.album?.id, {
            [keyType]: key
          }), { headers })
          const album = await albumRes.json() as Album
          if (!album?.id) {
            log('Invalid album ID - ' + link?.album?.id)
            return {
              valid: false
            }
          }
          // Replace the empty link.assets array with the array of assets from the album
          link.assets = album.assets
          if (link.album) link.album.albumThumbnailAssetId = album.albumThumbnailAssetId
        }

        link.password = password
        if (link.expiresAt && dayjs(link.expiresAt) < dayjs()) {
          // This link has expired
          log('Expired link ' + key)
        } else {
          // Filter assets to exclude trashed assets
          link.assets = link.assets.filter(asset => !asset.isTrashed)
          // Populate the shared assets with the public key/password
          link.assets.forEach(asset => {
            asset.key = key
            asset.keyType = keyType
            asset.password = password
          })
          // Sort album if there is a sort order specified
          const sortOrder = link.album?.order
          if (sortOrder === 'asc') {
            link.assets.sort((a, b) => a?.fileCreatedAt?.localeCompare(b.fileCreatedAt || '') || 0)
          } else if (sortOrder === 'desc') {
            link.assets.sort((a, b) => b?.fileCreatedAt?.localeCompare(a.fileCreatedAt || '') || 0)
          }
          return {
            valid: true,
            link
          }
        }
      } else if (res.status === 401) {
        // Immich returns 401 for both invalid keys and password-protected shares.
        // Check the message to distinguish between the two cases.
        if (jsonBody?.message === 'Invalid share key' || jsonBody?.message === 'Invalid share slug') {
          // Known invalid key/slug - treat as invalid request
          log('Invalid share key ' + key)
        } else {
          // Default: treat as password required (fail-safe)
          return {
            valid: true,
            passwordRequired: true
          }
        }
      } else {
        console.log(JSON.stringify(jsonBody))
      }
    }
  } else {
    // Otherwise return failure
    log('Immich response ' + res.status + ' for key ' + key)
    try {
      console.log(res.headers.get('Content-Type'))
      console.log((await res.text()).slice(0, 500))
      log('Unexpected response from Immich API at ' + apiUrl())
      log('Please make sure the IPP container is able to reach this path.')
    } catch (e) {
      console.log(e)
    }
  }
  return {
    valid: false
  }
}

/**
 * Get the content-type of a video, for the lightbox <video> element
 */
export async function getVideoContentType (asset: Asset) {
  const headers = await authHeaders(asset.keyType, asset.key, asset.password)
  const data = await request(buildUrl('/assets/' + encodeURIComponent(asset.id) + '/video/playback', {
    [asset.keyType]: asset.key
  }), { headers })
  return data.headers.get('Content-Type')
}

/**
 * Build the `Cookie` header that authenticates to Immich for a
 * password-protected share. Returns `{}` (no Cookie header) when the share
 * has no password or login failed; in those cases Immich will respond 401
 * for protected resources, which the caller handles as "password required".
 */
export async function authHeaders (keyType: KeyType, key: string, password?: string): Promise<Record<string, string>> {
  if (!password) return {}
  const token = await getSharedLinkToken(key, password, keyType)
  return token ? { Cookie: `immich_shared_link_token=${token}` } : {}
}

/**
 * Cached login: fetch an `immich_shared_link_token` for the given password,
 * or return null on failure. The cache is per (keyType, key, password) so
 * that a request without the correct password can't reuse another visitor's
 * authenticated session. See `tokenCache` doc-comment for the security
 * argument.
 */
async function getSharedLinkToken (key: string, password: string, keyType: KeyType): Promise<string | null> {
  const cacheKey = `${keyType}:${key}:${password}`
  const cached = tokenCache.get(cacheKey)
  if (cached) return cached

  const promise = sharedLinkLogin(key, password, keyType)
  tokenCache.set(cacheKey, promise)
  promise.then(
    (token) => { if (!token) tokenCache.delete(cacheKey) },
    () => { tokenCache.delete(cacheKey) }
  )
  return promise
}

/**
 * `POST /shared-links/login`. Replaces the deprecated `?password=...` query
 * param. Returns the cookie value on success, null on any failure.
 */
async function sharedLinkLogin (key: string, password: string, keyType: KeyType): Promise<string | null> {
  const url = buildUrl(apiUrl() + '/shared-links/login', { [keyType]: key })
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    if (res.status !== 201) return null
    const setCookie = res.headers.get('set-cookie') || ''
    const match = setCookie.match(/immich_shared_link_token=([^;,]+)/)
    return match ? match[1] : null
  } catch (e) {
    return null
  }
}

/**
 * Build safely-encoded URL string.
 */
export function buildUrl (baseUrl: string, params: { [key: string]: string | undefined } = {}) {
  // Remove empty properties
  params = Object.fromEntries(Object.entries(params).filter(([_, value]) => !!value))
  let query = ''
  // Safely encode query parameters
  if (Object.entries(params).length) {
    query = '?' + (new URLSearchParams(params as {
      [key: string]: string
    })).toString()
  }
  return baseUrl + query
}

/**
 * Whether this asset must be served from `/original` to remain useful, bypassing
 * the `ipp.downloadOriginalPhoto` downgrade.
 *
 * - Videos: Immich's preview/thumbnail endpoints return a poster JPEG, not the
 *   video, so the downgrade would replace a video file with a still image.
 * - Animated images (currently just GIF): Immich's preview is a static JPEG,
 *   so the downgrade silently strips the animation. APNG/animated-WebP aren't
 *   listed because Immich doesn't expose a distinct MIME type for them - they
 *   share `image/png` / `image/webp` with their static counterparts.
 *
 * Used by both the display path (lightbox preview URL) and the download path
 * (single-asset download + zip), so the lightbox shows the same bytes the
 * user gets when they hit "download".
 */
export function requiresOriginal (asset: Asset): boolean {
  if (asset.type === AssetType.video) {
    return true
  } else if (asset.originalMimeType?.startsWith('video/')) {
    return true
  } else if (asset.originalMimeType === 'image/gif') {
    return true
  }
  return false
}

/**
 * Return the correct preview size, depending on the image MIME type.
 * For animated formats, use the original file rather than the preview so
 * animation is preserved (Immich's preview is a static JPEG frame).
 */
export function getPreviewImageSize (asset: Asset) {
  return requiresOriginal(asset) ? ImageSize.original : ImageSize.preview
}

/**
 * Return the image data URL for a photo
 */
export function photoUrl (key: string, id: string, size?: ImageSize) {
  const path = ['photo', key, id]
  if (size) path.push(size)
  return buildUrl('/share/' + path.join('/'))
}

/**
 * Return the video data URL for a video
 */
export function videoUrl (key: string, id: string) {
  return buildUrl(`/share/video/${key}/${id}`)
}

/**
 * Check if a provided ID matches the Immich ID format
 */
export function isId (id: string) {
  return !!id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
}

/**
 * Check if a provided key matches the Immich shared-link key format.
 * It appears that the key is always 67 chars long, but since I don't know that this
 * will always be the case, I've left it open-ended.
 */
export function isKey (key: string) {
  return !!key.match(/^[\w-]+$/)
}

/**
 * Reachability ping for the `/share/healthcheck` route.
 */
export async function accessible () {
  return !!(await request('/server/ping'))
}

/**
 * Coerce an unknown `size` parameter from a URL into a valid ImageSize,
 * defaulting to preview when the input is missing or unrecognised.
 */
export function validateImageSize (size: unknown) {
  if (!size || !Object.values(ImageSize).includes(size as ImageSize)) {
    return ImageSize.preview
  } else {
    return size as ImageSize
  }
}

/**
 * Map the URL path prefix (`share` or `s`) to the corresponding `KeyType`.
 */
export function getKeyTypeFromShare (shareType: string) {
  return shareType === 's' ? KeyType.slug : KeyType.key
}
