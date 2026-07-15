import {
  AlbumType,
  Asset,
  AssetType,
  ImageSize,
  IncomingShareRequest,
  KeyType,
  SharedLink,
  SharedLinkResult,
  TimelineBucket,
  TimelineBucketAssets
} from './types'
import dayjs from 'dayjs'
import { getConfigOption } from './config/access'
import { addResponseHeaders } from './http'
import { canDownload } from './share'
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
  getShareByKey, which for album shares also enumerates the album's assets
  from Immich's timeline API (1 + N_buckets requests). Without this cache, a
  gallery view of N tiles fans out into N concurrent enumerations against
  Immich and serializes there, pushing per-thumbnail latency into seconds.
  The cache holds Promises (not resolved values) so concurrent cold misses
  coalesce into one upstream call instead of stampeding.

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

/*
  Per-asset detail cache for the lazy album flow. When a `needsDetail` album
  item opens in the lightbox, the `/meta/` route fetches the full asset from
  `GET /assets/:id` for its exif / filename. Paging quickly through a gallery
  (or prefetching neighbours) would otherwise re-fetch the same asset; this
  coalesces repeats. Keyed by (keyType, key, id); holds Promises so concurrent
  opens of the same asset share one upstream call.
*/
const assetDetailCache = new TtlLruCache<Promise<Asset | undefined>>({ ttlMs: 120_000, max: 500 })

/**
 * Memoise an in-flight Promise in `cache`, coalescing concurrent callers onto
 * a single upstream call. The entry is evicted as soon as it resolves to an
 * invalid value (per `isValid`, default "falsy is invalid") or rejects, so a
 * transient Immich blip never poisons the cache with a negative result.
 *
 * This is the shared form of the "should this stay cached?" policy that
 * TtlLruCache deliberately leaves to its callers (see its doc-comment): the
 * cache stays storage-only; the eviction rule lives here, once, instead of
 * being hand-copied at each call site.
 */
function cachedPromise<T> (
  cache: TtlLruCache<Promise<T>>,
  key: string,
  factory: () => Promise<T>,
  isValid: (value: T) => boolean = (value) => !!value
): Promise<T> {
  const cached = cache.get(key)
  if (cached) return cached

  const promise = factory()
  cache.set(key, promise)
  promise.then(
    (value) => { if (!isValid(value)) cache.delete(key) },
    () => { cache.delete(key) }
  )
  return promise
}

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
    log(`From the container IPP is running in, run this and check you receive a JSON result: node -e "fetch('${apiUrl()}/server/ping').then(r => r.text()).then(console.log).catch(console.error)"`)
    log('Avoid testing with curl - curl uses its own DNS resolver and can succeed even when the resolver Node/IPP uses (musl getaddrinfo) fails. See https://github.com/alangrainger/immich-public-proxy/issues/263')
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

  if (req.mode === 'download' && canDownload(link)) {
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
 * The cache holds the full post-album-enumeration SharedLinkResult, so warm
 * hits skip both the `/shared-links/me` and the timeline round trips.
 * Negative results (`valid: false`) and rejections are dropped from the
 * cache immediately so a transient Immich blip doesn't poison the cache.
 */
export function getShareByKey (key: string, password?: string, keyType: KeyType = KeyType.key): Promise<SharedLinkResult> {
  const cacheKey = `${keyType}:${key}:${password ?? ''}`
  // A `{ valid: false }` result is a truthy object, so the default eviction
  // rule wouldn't drop it - key off `.valid` explicitly.
  return cachedPromise(shareCache, cacheKey, () => fetchShareByKey(key, password, keyType), (result) => !!result?.valid)
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

        // For an album, `/shared-links/me` returns an empty `assets` array
        // (Immich 3.0 dropped album assets from both that response and
        // `AlbumResponseDto`). We enumerate the album's assets from the
        // timeline API instead - the same approach Immich's own web client
        // uses for shared albums. This yields grid-only assets; their full
        // detail (exif, filename) is fetched lazily on lightbox open. The
        // album cover id we need for og:image is already on `link.album`
        // (mapAlbum still returns albumThumbnailAssetId).
        if (link.type === AlbumType.album) {
          if (!link.album?.id) {
            log('Album share missing album id for key ' + key)
            return {
              valid: false
            }
          }
          const albumAssets = await fetchAlbumAssets(link.album.id, keyType, key, headers)
          if (albumAssets === null) {
            // Enumeration failed upstream. Return invalid (not cached) rather
            // than caching an empty album for the next 120s on a transient blip.
            return {
              valid: false
            }
          }
          link.assets = albumAssets
        }

        link.password = password
        if (link.expiresAt && dayjs(link.expiresAt) < dayjs()) {
          // This link has expired
          log('Expired link ' + key)
        } else {
          if (!Array.isArray(link.assets)) {
            // Immich can return a shared link with no `assets` array (seen on
            // 3.0.x INDIVIDUAL shares - see #267). The album path above always
            // populates `link.assets`, so this only bites non-album shares.
            // Treat a missing array as empty rather than letting `.filter` of
            // undefined reject and take the whole process down.
            log('Shared link ' + key + ' returned no assets array (type ' + link.type + ')')
            link.assets = []
          }
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

// Base resolution used to turn an Immich `ratio` (width/height) into concrete
// width/height for layout + lightbox sizing. The justified-rows layout only
// needs the ratio; PhotoSwipe also uses these for its fit/zoom maths, so we
// scale to a realistic preview-sized longest edge rather than `ratio`x1.
const TIMELINE_BASE_EDGE = 1600

/**
 * Turn an Immich timeline `ratio` (width / height, already orientation-aware)
 * into concrete pixel dimensions whose longest edge is TIMELINE_BASE_EDGE.
 */
function ratioToDimensions (ratio: number): { width: number, height: number } {
  if (!ratio || ratio <= 0 || !isFinite(ratio)) {
    return { width: TIMELINE_BASE_EDGE, height: TIMELINE_BASE_EDGE }
  }
  return ratio >= 1
    ? { width: TIMELINE_BASE_EDGE, height: Math.round(TIMELINE_BASE_EDGE / ratio) }
    : { width: Math.round(TIMELINE_BASE_EDGE * ratio), height: TIMELINE_BASE_EDGE }
}

/**
 * Map a columnar `GET /timeline/bucket` response into grid-only `Asset`s.
 * Only the fields needed to render the gallery grid are populated; exif /
 * filename / mime are filled in lazily on lightbox open (`needsDetail`).
 * `key` / `keyType` / `password` are stamped by the caller.
 */
function timelineBucketToAssets (bucket: TimelineBucketAssets): Asset[] {
  const assets: Asset[] = []
  const count = bucket?.id?.length || 0
  for (let i = 0; i < count; i++) {
    const { width, height } = ratioToDimensions(bucket.ratio?.[i])
    assets.push({
      id: bucket.id[i],
      key: '',
      keyType: KeyType.key,
      type: bucket.isImage?.[i] ? AssetType.image : AssetType.video,
      isTrashed: !!bucket.isTrashed?.[i],
      fileCreatedAt: bucket.fileCreatedAt?.[i],
      thumbhash: bucket.thumbhash?.[i] || undefined,
      width,
      height,
      needsDetail: true
    })
  }
  return assets
}

/**
 * Enumerate an album's assets via Immich's timeline API, scoped by album id +
 * shared-link key. `GET /timeline/buckets` lists the time buckets (months),
 * then one `GET /timeline/bucket` per bucket returns that bucket's assets in
 * a columnar shape. Request volume is `1 + N_buckets`, not `N_assets`, so it
 * scales flat with album size (a 5000-image album is ~a dozen calls).
 *
 * All-or-nothing: returns `null` if the bucket list or any bucket fetch fails
 * (so the caller can treat it as an invalid, uncached result rather than a
 * partial/empty album). Returns an empty array only for a genuinely empty
 * album. Never throws - a rejection here would surface as an unhandled
 * rejection and take the process down.
 */
async function fetchAlbumAssets (albumId: string, keyType: KeyType, key: string, headers: Record<string, string>): Promise<Asset[] | null> {
  try {
    const bucketsRes = await fetch(buildUrl(apiUrl() + '/timeline/buckets', {
      albumId,
      [keyType]: key
    }), { headers })
    if (!bucketsRes.ok) {
      log('Failed to list timeline buckets for album ' + albumId + ' (status ' + bucketsRes.status + ')')
      return null
    }
    const buckets = await bucketsRes.json() as TimelineBucket[]
    const perBucket = await Promise.all((buckets || []).map(async (bucket) => {
      const res = await fetch(buildUrl(apiUrl() + '/timeline/bucket', {
        albumId,
        timeBucket: bucket.timeBucket,
        [keyType]: key
      }), { headers })
      if (!res.ok) {
        log('Failed to fetch timeline bucket ' + bucket.timeBucket + ' for album ' + albumId + ' (status ' + res.status + ')')
        return null
      }
      return timelineBucketToAssets(await res.json() as TimelineBucketAssets)
    }))
    // If any bucket failed, treat the whole enumeration as failed.
    if (perBucket.some(b => b === null)) return null
    return (perBucket as Asset[][]).flat()
  } catch (e) {
    log('Error enumerating album ' + albumId + ' via timeline: ' + (e instanceof Error ? e.message : String(e)))
    return null
  }
}

/**
 * Fetch a single asset's full detail (`GET /assets/:id`) for the lazy album
 * flow, cached + de-duplicated per (keyType, key, id). The `asset` argument
 * supplies the id and the already-stamped key/keyType/password. Returns
 * undefined on any failure.
 */
export function fetchAssetDetail (asset: Asset): Promise<Asset | undefined> {
  const cacheKey = `${asset.keyType}:${asset.key}:${asset.id}`
  return cachedPromise(assetDetailCache, cacheKey, async () => {
    const headers = await authHeadersForAsset(asset)
    const res = await fetch(assetFetchUrl(asset, ''), { headers })
    if (!res.ok) return undefined
    return await res.json() as Asset
  })
}

/**
 * Get the content-type of a video, for the lightbox <video> element
 */
export async function getVideoContentType (asset: Asset) {
  const headers = await authHeadersForAsset(asset)
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
 * `authHeaders` for an asset whose key/keyType/password are already stamped on
 * it (the common case for share-scoped fetches).
 */
export function authHeadersForAsset (asset: Asset): Promise<Record<string, string>> {
  return authHeaders(asset.keyType || KeyType.key, asset.key, asset.password)
}

/**
 * Build the Immich URL that serves `subpath` for `asset` (e.g. `/original`,
 * `/video/playback`), with the share key and optional `size` query param
 * encoded. `buildUrl` drops the `size` param when it is undefined.
 */
export function assetFetchUrl (asset: Asset, subpath: string, sizeQueryParam?: string): string {
  return buildUrl(apiUrl() + '/assets/' + encodeURIComponent(asset.id) + subpath, {
    [asset.keyType || KeyType.key]: asset.key,
    size: sizeQueryParam
  })
}

/**
 * Cached login: fetch an `immich_shared_link_token` for the given password,
 * or return null on failure. The cache is per (keyType, key, password) so
 * that a request without the correct password can't reuse another visitor's
 * authenticated session. See `tokenCache` doc-comment for the security
 * argument.
 */
function getSharedLinkToken (key: string, password: string, keyType: KeyType): Promise<string | null> {
  const cacheKey = `${keyType}:${key}:${password}`
  // Default eviction (falsy is invalid) drops a null/empty token, so a failed
  // login is never cached.
  return cachedPromise(tokenCache, cacheKey, () => sharedLinkLogin(key, password, keyType))
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
