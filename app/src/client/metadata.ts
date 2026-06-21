/*
Lazy per-asset metadata loading for album shares. Album items arrive as
grid-only data (id, type, thumbhash, dimensions); their exif / description /
real download filename are fetched from the `/meta/` route the first time
the item opens in the lightbox - mirroring how Immich's own web client loads
shared-album detail on demand. Individual shares bake everything in and
never reach this module (no `metaBase`).
*/

import { state } from './state.js'
import type { GalleryItem, AssetMetadata } from '../shared/types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LightboxInstance = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PswpInstance = any

// One in-flight (then resolved) request per asset id, so paging back and
// forth - or prefetching a neighbour we then navigate to - reuses the fetch.
const detailCache = new Map<string, Promise<AssetMetadata | null>>()

function fetchDetail (id: string): Promise<AssetMetadata | null> {
  const cached = detailCache.get(id)
  if (cached) return cached
  const promise = fetch(state.metaBase + '/' + encodeURIComponent(id))
    .then(res => (res.ok ? res.json() as Promise<AssetMetadata> : null))
    .catch(() => null)
  detailCache.set(id, promise)
  return promise
}

/**
 * Copy fetched detail onto the grid item in place and clear `needsDetail`.
 * Only fills fields the server sent (all are config/share gated), so a share
 * with metadata disabled simply leaves them unset.
 */
function applyMeta (item: GalleryItem, meta: AssetMetadata): void {
  if (meta.exif) item.exif = meta.exif
  if (meta.description) item.description = meta.description
  if (meta.downloadFilename) item.downloadFilename = meta.downloadFilename
  item.needsDetail = false
}

/**
 * Ensure `item`'s detail is loaded. Resolves true when this call is the one
 * that applied the detail (so the caller can refresh the view), false if the
 * item needs no detail, the fetch failed, or another call already applied it.
 */
function ensureDetail (item: GalleryItem | undefined): Promise<boolean> {
  if (!item || !item.needsDetail) return Promise.resolve(false)
  return fetchDetail(item.id).then(meta => {
    if (!meta || !item.needsDetail) return false
    applyMeta(item, meta)
    return true
  })
}

/**
 * Warm the cache for a neighbouring slide without touching the view, so
 * paging next/prev shows detail instantly (matches Immich's prefetch).
 */
function prefetch (item: GalleryItem | undefined): void {
  if (item && item.needsDetail) fetchDetail(item.id)
}

function loadCurrent (pswp: PswpInstance): void {
  const index = pswp.currIndex
  ensureDetail(state.items[index]).then(applied => {
    // Only refresh if the user is still on the slide we loaded for.
    if (applied && pswp.currIndex === index) {
      state.slideRefreshers.forEach(fn => fn())
    }
  })
  prefetch(state.items[index + 1])
  prefetch(state.items[index - 1])
}

/**
 * Hook lazy detail loading into the lightbox. Loads the opened slide's detail
 * (and prefetches its neighbours) on open and on every slide change. No-op
 * unless the share exposed a `metaBase` (album shares only).
 */
export function registerLazyDetail (lightbox: LightboxInstance): void {
  if (!state.metaBase) return
  lightbox.on('uiRegister', () => {
    const pswp = lightbox.pswp
    loadCurrent(pswp)
    pswp.on('change', () => loadCurrent(pswp))
  })
}
