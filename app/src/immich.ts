import {
  AlbumType,
  Asset,
  AssetType,
  KeyType,
  SharedLinkResult,
  addNoStoreHeaders,
  addResponseHeaders,
  apiUrl,
  authHeaders,
  buildUrl,
  cachedPromise,
  fetchSharedLink,
  getConfigOption,
  invalidPasswordResponse,
  isKey,
  log,
  Password,
  renderPage,
  request,
  respondToInvalidRequest,
  storeUnlock,
  TtlLruCache
} from '@ipp/core'
import { ImageSize, IncomingShareRequest, TimelineBucket, TimelineBucketAssets } from './types'
import { canDownload, servableAssets } from './share'
import { assetBuffer } from './stream/asset'
import { downloadAll } from './stream/download'
import { gallery } from './gallery/builder'
import { Response } from 'express-serve-static-core'
import { h } from 'preact'

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
  Per-asset detail cache for the lazy album flow. When a `needsDetail` album
  item opens in the lightbox, the `/meta/` route fetches the full asset from
  `GET /assets/:id` for its exif / filename. Paging quickly through a gallery
  (or prefetching neighbours) would otherwise re-fetch the same asset; this
  coalesces repeats. Keyed by (keyType, key, id); holds Promises so concurrent
  opens of the same asset share one upstream call.
*/
const assetDetailCache = new TtlLruCache<Promise<Asset | undefined>>({ ttlMs: 120_000, max: 500 })

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
    invalidPasswordResponse(req.req, res, req.key)
  }

  // Don't cache password-protected albums
  if (sharedLinkRes.passwordRequired || req.password) addNoStoreHeaders(res)

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
    storeUnlock(req.req, link.key, req.password)
  }

  // Everything is ok - output the shared link data

  if (req.mode === 'download' && canDownload(link)) {
    // Download all assets as a zip file
    await downloadAll(res, link)
  } else if (link.assets.length === 1) {
    // This is an individual item (not a gallery)
    log('Serving link ' + req.key)
    const asset = link.assets[0]
    // Photos default to a direct image unless `singleImage` opts into a gallery;
    // videos default to a gallery unless `singleVideo` is explicitly disabled.
    const directImage = asset.type === AssetType.image && !getConfigOption('ipp.gallery.singleImage')
    const directVideo = asset.type === AssetType.video && !getConfigOption('ipp.gallery.singleVideo', true)
    if ((directImage || directVideo) && !req.password) {
      // Output the asset directly rather than a gallery page, unless it's a
      // password-protected link
      await assetBuffer(req, res, link.assets[0], ImageSize.preview, link, directVideo)
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
  const result = await fetchSharedLink(key, keyType, password)
  if (!result.link) return result
  const link = result.link

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
    const albumAssets = await fetchAlbumAssets(link.album.id, keyType, key, await authHeaders(keyType, key, password))
    if (albumAssets === null) {
      // Enumeration failed upstream. Return invalid (not cached) rather
      // than caching an empty album for the next 120s on a transient blip.
      return {
        valid: false
      }
    }
    link.assets = albumAssets
  }

  if (!Array.isArray(link.assets)) {
    // Defensive guard: the returned album should always(?) populate this array
    log('Shared link ' + key + ' returned no assets array (type ' + link.type + ')')
    link.assets = []
  }
  // Drop trashed assets, and any Immich hasn't finished processing
  link.assets = servableAssets(link.assets)
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
  return result
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
/**
 * Reconstruct an asset's timezone-agnostic local timestamp from its UTC
 * `fileCreatedAt` and `localOffsetHours`. Returns an ISO string whose date /
 * time portion reads as the photographer's local wall-clock (the `Z` suffix is
 * nominal, as with Immich's own `localDateTime`). Undefined if no timestamp.
 */
export function localDateTimeFromOffset (fileCreatedAt?: string, offsetHours?: number): string | undefined {
  if (!fileCreatedAt) return undefined
  // The timeline bucket API serialises fileCreatedAt as a zone-less UTC
  // string ('2024-12-11T07:41:54'). Date.parse treats a zone-less date-time
  // as SERVER-LOCAL time, which would skew every date by the server's UTC
  // offset (e.g. 12h early on a UTC+12 host) - pin it to UTC explicitly.
  const utc = /(?:[Zz]|[+-]\d{2}:?\d{2})$/.test(fileCreatedAt) ? fileCreatedAt : fileCreatedAt + 'Z'
  const ms = Date.parse(utc)
  if (isNaN(ms)) return undefined
  return new Date(ms + (offsetHours || 0) * 3600_000).toISOString()
}

function timelineBucketToAssets (bucket: TimelineBucketAssets): Asset[] {
  const assets: Asset[] = []
  const count = bucket?.id?.length || 0
  for (let i = 0; i < count; i++) {
    const { width, height } = ratioToDimensions(bucket.ratio?.[i])
    const fileCreatedAt = bucket.fileCreatedAt?.[i]
    assets.push({
      id: bucket.id[i],
      key: '',
      keyType: KeyType.key,
      type: bucket.isImage?.[i] ? AssetType.image : AssetType.video,
      isTrashed: !!bucket.isTrashed?.[i],
      fileCreatedAt,
      // The bucket response has no localDateTime; reconstruct it from the UTC
      // timestamp plus the per-asset offset, matching what Immich's own
      // timeline does when grouping by local day / month.
      localDateTime: localDateTimeFromOffset(fileCreatedAt, bucket.localOffsetHours?.[i]),
      thumbhash: bucket.thumbhash?.[i] || undefined,
      livePhotoVideoId: bucket.livePhotoVideoId?.[i] || undefined,
      width,
      height,
      needsDetail: true
    })
  }
  return assets
}

/**
 * Normalise a `/timeline/buckets` key for the `/timeline/bucket` lookup.
 *
 * Immich lists buckets as bare UTC dates (`2026-06-01`) but matches the
 * lookup by casting the string back to a timestamp in Postgres's session
 * timezone. On a non-UTC database that lands in the previous month and the
 * bucket comes back empty - every album shows zero photos #260. The explicit
 * `T00:00:00.000Z` form is what Immich's web client sends: (immich-app/immich#22672).
 */
export function utcBucketKey (timeBucket: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(timeBucket) ? timeBucket + 'T00:00:00.000Z' : timeBucket
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
        timeBucket: utcBucketKey(bucket.timeBucket),
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
 * Get the content-type of a video, for the lightbox <video> element. Undefined
 * when Immich can't serve it, so one missing video doesn't break the share #119
 */
export async function getVideoContentType (asset: Asset): Promise<string | undefined> {
  const headers = await authHeadersForAsset(asset)
  const data = await request(buildUrl('/assets/' + encodeURIComponent(asset.id) + '/video/playback', {
    [asset.keyType]: asset.key
  }), { headers })
  if (!(data instanceof globalThis.Response)) return undefined
  // Only the header is needed; an unread body keeps the whole video download open
  await data.body?.cancel()
  return data.headers.get('Content-Type') || undefined
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
