import { Asset, ImageSize } from '../types'
import { getConfigOption } from '../config/access'
import { sanitize } from '../utils/sanitize'

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
 * The extension reflects what bytes the user will receive, not what the
 * original was - when Immich downgrades an image-original to preview (see
 * resolveImageEndpoint), the served bytes are JPEG even if the original is
 * HEIC/DNG/RAW, and the filename must match the bytes.
 *
 * @param asset
 * @param [servedSize] - what size Immich will actually serve. Defaults to
 *   ImageSize.original (the bytes match the original asset).
 */
export function getFilename (asset: Asset, servedSize: ImageSize = ImageSize.original): string {
  let servedMime: string | undefined
  if (servedSize === ImageSize.original) {
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
      const stem = servedSize === ImageSize.original
        ? cleanName
        : cleanName.replace(/\.[a-zA-Z0-9]{2,5}$/, '')
      return withMimeExtension(stem, servedMime)
    }
  }
}
