import { Asset, ImageSize } from '../types'
import { getConfigOption } from '../config/access'
import { sanitize } from '../utils/sanitize'
import { resolveImageEndpoint } from './sizing'

/**
 * Map an Immich asset MIME type to a file extension (including the dot).
 * Returns '' for unknown types; obscure RAW types fall through to '' so
 * the original filename (which usually has the correct extension) is
 * preserved by `withMimeExtension`.
 */
function mimeToExt (mime: string | undefined): string {
  if (!mime) return ''
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'image/avif': '.avif',
    'image/tiff': '.tiff',
    'image/svg+xml': '.svg',
    'image/x-adobe-dng': '.dng',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
    'video/x-msvideo': '.avi',
    'video/x-matroska': '.mkv'
  }
  return map[mime] || ''
}

/**
 * Append the MIME-derived extension to `filename` if it isn't already
 * present (case-insensitive). Returns the filename unchanged when the
 * MIME isn't in our map. Aliases that share a MIME type (`.jpg`/`.jpeg`,
 * `.tif`/`.tiff`) are accepted as already-present so we don't produce
 * `IMG.jpeg.jpg` for an `image/jpeg` asset.
 */
function withMimeExtension (filename: string, mime: string | undefined): string {
  const ext = mimeToExt(mime)
  if (!ext) return filename
  const aliases: Record<string, string[]> = {
    '.jpg': ['.jpg', '.jpeg'],
    '.tiff': ['.tif', '.tiff']
  }
  const acceptable = aliases[ext] ?? [ext]
  const lower = filename.toLowerCase()
  return acceptable.some(a => lower.endsWith(a)) ? filename : filename + ext
}

/**
 * Generate a filename for the downloaded asset based on the configuration option chosen.
 *
 * The extension reflects the served bytes, not the original: converted
 * bytes follow Immich's image settings, so pass the upstream content-type
 * as `servedMimeOverride`.
 *
 * @param asset
 * @param [servedSize] - what size Immich will actually serve. Defaults to
 *   ImageSize.original (the bytes match the original asset).
 * @param [servedMimeOverride] - actual MIME of the served bytes when they
 *   differ from the original (a `/video/playback` transcode). Ignored when it
 *   doesn't map to a known extension, so an unrecognised content-type can't
 *   strip the filename's extension.
 */
export function getFilename (asset: Asset, servedSize: ImageSize = ImageSize.original, servedMimeOverride?: string): string {
  const override = mimeToExt(servedMimeOverride) ? servedMimeOverride : undefined
  let servedMime: string | undefined
  if (override) {
    servedMime = override
  } else if (servedSize === ImageSize.original) {
    servedMime = asset.originalMimeType
  } else if (servedSize === ImageSize.thumbnail) {
    servedMime = 'image/webp'
  } else {
    servedMime = 'image/jpeg'
  }

  switch (getConfigOption('ipp.downloadedFilename')) {
    case 1:
      // Immich's ID number for this asset
      return withMimeExtension(asset.id, servedMime)
    case 2:
      // A sanitised version of the ID number
      return withMimeExtension('img_' + asset.id.slice(0, 8), servedMime)
    default: {
      // By default, use the asset's original filename
      const cleanName = asset.originalFileName ? sanitize(asset.originalFileName) : ''
      if (!cleanName) return withMimeExtension(asset.id, servedMime)
      // Keep the original extension only when the served bytes really are the
      // original file; a size downgrade or playback transcode replaces it.
      const stem = servedSize === ImageSize.original && !override
        ? cleanName
        : cleanName.replace(/\.[a-zA-Z0-9]{2,5}$/, '')
      return withMimeExtension(stem, servedMime)
    }
  }
}

/**
 * Filename for a downloaded asset, whose extension matches the bytes a download
 * (`/original` request) actually returns after the `maxDownloadQuality` clamp.
 * Used by both the eager (gallery builder) and lazy (`/meta/`) item paths.
 */
export function downloadFilename (asset: Asset): string {
  return getFilename(asset, resolveImageEndpoint(ImageSize.original, asset).servedSize)
}
