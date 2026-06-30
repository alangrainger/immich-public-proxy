import { Asset, AssetType, ImageSize } from '../types'
import { getConfigOption } from '../config/access'

/*
  Single source of truth for image-size policy: given a requested ImageSize
  and an asset, decide which Immich endpoint actually serves it.
*/

export interface ImageEndpoint {
  subpath: string
  sizeQueryParam?: string
  attachment: boolean
  servedSize: ImageSize
}

/**
 * Whether this asset must be served from `/original` to remain useful,
 * bypassing the operator's quality ceilings.
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

/*
  MIME types a browser can render directly, mirroring Immich's
  `isWebSupportedImage`. For these the `fullsize` tier resolves to the original
  bytes (`/original`); everything else (RAW/HEIF/TIFF/...) gets Immich's
  converted full-size JPEG via `?size=fullsize`.
*/
const WEB_DISPLAYABLE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

function isWebDisplayable (asset: Asset): boolean {
  return !!asset.originalMimeType && WEB_DISPLAYABLE_MIME.has(asset.originalMimeType)
}

/*
  Detail ladder for the photo tiers, ascending. THUMBNAIL is deliberately
  excluded: it is the grid poster and is always served exactly as requested
  (for a video/gif it is the correct still frame), so it short-circuits before
  the clamp below and is never promoted or demoted.
*/
const LADDER = [ImageSize.preview, ImageSize.fullsize, ImageSize.original]
const rank = (size: ImageSize) => LADDER.indexOf(size)
const clamp = (size: ImageSize, lo: ImageSize, hi: ImageSize) =>
  LADDER[Math.min(Math.max(rank(size), rank(lo)), rank(hi))]

/**
 * Operator ceiling for the download tier (`ipp.maxDownloadQuality`). `original`
 * is allowed here because a download needn't be browser-renderable.
 */
function maxDownloadQuality (): ImageSize {
  const value = getConfigOption('ipp.maxDownloadQuality', 'original')
  if (value === 'preview') return ImageSize.preview
  if (value === 'fullsize') return ImageSize.fullsize
  return ImageSize.original
}

/**
 * Operator ceiling for the zoom tier (`ipp.maxZoomQuality`). `original` is
 * deliberately not an option: a zoom upgrade must stay browser-displayable, and
 * the original could be an unviewable RAW/DNG or a huge file.
 */
function maxZoomQuality (): ImageSize {
  return getConfigOption('ipp.maxZoomQuality', 'preview') === 'fullsize'
    ? ImageSize.fullsize
    : ImageSize.preview
}

/**
 * Highest tier permitted for `requested`, which doubles as the intent:
 * `original` (download) caps at `maxDownloadQuality`, `fullsize` (zoom) caps at
 * `maxZoomQuality`. `preview` / `thumbnail` are never capped.
 */
function ceiling (requested: ImageSize): ImageSize {
  if (requested === ImageSize.original) return maxDownloadQuality()
  if (requested === ImageSize.fullsize) return maxZoomQuality()
  return requested
}

/**
 * Resolve the Immich endpoint that serves `requested` for `asset`.
 *
 * `servedSize` is the tier Immich will actually return after clamping, which
 * may be lower than requested (e.g. an `original` downgraded to `preview` when
 * `ipp.maxDownloadQuality` is `preview`). Callers use it to derive a filename
 * whose extension matches the bytes (see getFilename).
 *
 * `attachment` reflects intent and is keyed off the REQUESTED size, not the
 * served one: an `original` request is a download (gets Content-Disposition);
 * preview/fullsize/thumbnail are for display. This is what lets a gif served
 * from `/original` for inline display stay inline, while a gif *download* from
 * the same endpoint gets the attachment header.
 */
export function resolveImageEndpoint (requested: ImageSize, asset: Asset): ImageEndpoint {
  const attachment = requested === ImageSize.original
  // Thumbnail is the grid poster: served as-is, never clamped (a video/gif
  // thumbnail must stay a small still, not get promoted to the original file).
  if (requested === ImageSize.thumbnail) {
    return { subpath: '/thumbnail', attachment, servedSize: ImageSize.thumbnail }
  }
  // gif/video have no usable preview or fullsize (a static frame), so they are
  // always served from the original file, bypassing the operator ceilings.
  if (requiresOriginal(asset)) {
    return endpointFor(ImageSize.original, asset, attachment)
  }
  const served = clamp(requested, ImageSize.preview, ceiling(requested))
  return endpointFor(served, asset, attachment)
}

/**
 * The one place that maps a (clamped) ImageSize onto a concrete Immich path,
 * and the only place that knows `fullsize` is per-asset.
 */
function endpointFor (size: ImageSize, asset: Asset, attachment: boolean): ImageEndpoint {
  switch (size) {
    case ImageSize.original:
      return { subpath: '/original', attachment, servedSize: ImageSize.original }
    case ImageSize.fullsize:
      // Web formats: fullsize is the original bytes, served from /original.
      // Non-web (RAW/HEIF): Immich's converted full-size JPEG via ?size=fullsize
      // (falls back to preview unless full-size generation is enabled in Immich).
      return isWebDisplayable(asset)
        ? { subpath: '/original', attachment, servedSize: ImageSize.original }
        : { subpath: '/thumbnail', sizeQueryParam: 'fullsize', attachment, servedSize: ImageSize.fullsize }
    default: // preview
      return { subpath: '/thumbnail', sizeQueryParam: 'preview', attachment, servedSize: ImageSize.preview }
  }
}
