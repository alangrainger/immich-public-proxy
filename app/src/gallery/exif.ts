import { Asset } from '../types'
import { GalleryExif } from '../shared/types'
import { getConfigOption } from '../config/access'

/**
 * Build the per-asset metadata sub-object included in the gallery JSON.
 * Reads `ipp.showMetadata.exif.*` and `ipp.showMetadata.location.*` config:
 * each group has a master `enabled` toggle, and within each group the
 * per-field flags default to `true`. A field appears in the output only
 * when both the group is enabled AND the field's own flag is true.
 *
 * Returns `undefined` when neither group is enabled, or when no fields
 * survive gating (so the client knows there's no metadata to show).
 *
 * The server never sends Immich values that the operator hasn't opted in
 * to via config; the client just renders what's present.
 */
export function pickExif (asset: Asset): GalleryExif | undefined {
  const exifInfo = asset?.exifInfo
  if (!exifInfo) return undefined

  const exifEnabled = !!getConfigOption('ipp.showMetadata.exif.enabled', false)
  const locationEnabled = !!getConfigOption('ipp.showMetadata.location.enabled', false)
  if (!exifEnabled && !locationEnabled) return undefined

  const out: GalleryExif = {}

  if (exifEnabled) {
    if (allow('exif.dateTimeOriginal') && exifInfo.dateTimeOriginal) {
      out.dateTimeOriginal = exifInfo.dateTimeOriginal
    }
    if (allow('exif.fileName') && asset.originalFileName) {
      out.fileName = asset.originalFileName
    }
    if (allow('exif.dimensions') && exifInfo.exifImageWidth && exifInfo.exifImageHeight) {
      out.width = exifInfo.exifImageWidth
      out.height = exifInfo.exifImageHeight
    }
    if (allow('exif.fileSize') && exifInfo.fileSizeInByte) {
      out.fileSizeInByte = exifInfo.fileSizeInByte
    }
    if (allow('exif.make') && exifInfo.make) out.make = exifInfo.make
    if (allow('exif.model') && exifInfo.model) out.model = exifInfo.model
    if (allow('exif.lensModel') && exifInfo.lensModel) out.lensModel = exifInfo.lensModel
    if (allow('exif.exposureTime') && exifInfo.exposureTime) out.exposureTime = exifInfo.exposureTime
    if (allow('exif.iso') && exifInfo.iso) out.iso = exifInfo.iso
    if (allow('exif.fNumber') && exifInfo.fNumber) out.fNumber = exifInfo.fNumber
    if (allow('exif.focalLength') && exifInfo.focalLength) out.focalLength = exifInfo.focalLength
  }

  if (locationEnabled) {
    if (allow('location.city') && exifInfo.city) out.city = exifInfo.city
    if (allow('location.state') && exifInfo.state) out.state = exifInfo.state
    if (allow('location.country') && exifInfo.country) out.country = exifInfo.country
    if (allow('location.gps') && exifInfo.latitude != null && exifInfo.longitude != null) {
      out.latitude = exifInfo.latitude
      out.longitude = exifInfo.longitude
    }
  }

  return Object.keys(out).length ? out : undefined
}

/**
 * Per-field gate. Defaults to `true` so that turning on a group exposes
 * every field unless the operator explicitly opts out of one.
 */
function allow (field: string): boolean {
  return !!getConfigOption(`ipp.showMetadata.${field}`, true)
}
