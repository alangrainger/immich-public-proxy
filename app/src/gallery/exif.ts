import { Asset, ExifInfo } from '../types'
import { GalleryExif } from '../shared/types'
import { getConfigOption } from '../config/access'

type Group = 'exif' | 'location'

interface FieldRule {
  // Config flag name, relative to the group (e.g. 'gps' -> ipp.showMetadata.location.gps)
  flag: string
  // Copies values from the Immich-side ExifInfo (+ asset for fileName) onto
  // the gallery-side GalleryExif if they're present and non-empty.
  emit: (out: GalleryExif, info: ExifInfo, asset: Asset) => void
}

/**
 * Trivial copy: `out[key] = info[key]` when present. Used for fields where
 * the config flag, source key, and output key all match.
 */
function copy (key: keyof ExifInfo & keyof GalleryExif): FieldRule {
  return {
    flag: key,
    emit: (out, info) => {
      const value = info[key]
      if (value != null && value !== '') (out as Record<string, unknown>)[key] = value
    }
  }
}

/*
  Fields whose config flag, ExifInfo key, and GalleryExif key are all the
  same string. `copy` handles the whole if/copy dance for each. Fields
  that need special handling (fileName, dimensions, fileSize, gps) appear
  inline in the `*_RULES` arrays below.
*/
const EXIF_FIELDS = [
  'dateTimeOriginal', 'make', 'model', 'lensModel',
  'exposureTime', 'iso', 'fNumber', 'focalLength'
] as const

const LOCATION_FIELDS = ['city', 'state', 'country'] as const

const EXIF_RULES: FieldRule[] = [
  ...EXIF_FIELDS.map(copy),
  {
    flag: 'fileName',
    emit: (out, _info, asset) => {
      if (asset.originalFileName) out.fileName = asset.originalFileName
    }
  },
  {
    flag: 'dimensions',
    emit: (out, info) => {
      if (info.exifImageWidth && info.exifImageHeight) {
        out.width = info.exifImageWidth
        out.height = info.exifImageHeight
      }
    }
  },
  {
    flag: 'fileSize',
    emit: (out, info) => {
      if (info.fileSizeInByte) out.fileSizeInByte = info.fileSizeInByte
    }
  }
]

const LOCATION_RULES: FieldRule[] = [
  ...LOCATION_FIELDS.map(copy),
  {
    flag: 'gps',
    emit: (out, info) => {
      if (info.latitude != null && info.longitude != null) {
        out.latitude = info.latitude
        out.longitude = info.longitude
      }
    }
  }
]

const RULES: Record<Group, FieldRule[]> = {
  exif: EXIF_RULES,
  location: LOCATION_RULES
}

/**
 * Build the per-asset metadata sub-object included in the gallery JSON.
 * Reads `ipp.showMetadata.exif.*` and `ipp.showMetadata.location.*` config:
 * each group has a master `enableAll` toggle and a set of per-field flags
 * that all default to `false`. A field appears in the output when either
 * the group's `enableAll` is true, OR the field's own flag is true.
 *
 * Returns `undefined` when neither group has any visible content, or when
 * no fields survive gating (so the client knows there's no metadata to
 * show).
 *
 * The server never sends Immich values that the operator hasn't opted in
 * to via config; the client just renders what's present.
 */
export function pickExif (asset: Asset): GalleryExif | undefined {
  const exifInfo = asset?.exifInfo
  if (!exifInfo) return undefined

  const exifActive = metadataGroupActive('exif')
  const locationActive = metadataGroupActive('location')
  if (!exifActive && !locationActive) return undefined

  const out: GalleryExif = {}
  if (exifActive) applyRules('exif', out, exifInfo, asset)
  if (locationActive) applyRules('location', out, exifInfo, asset)
  return Object.keys(out).length ? out : undefined
}

/**
 * Returns true if a metadata group would render any field for the current
 * config - either `enableAll` is set, or at least one per-field flag is
 * explicitly `true`. Used by the sidebar visibility check.
 */
export function metadataGroupActive (group: Group): boolean {
  if (groupEnableAll(group)) return true
  return RULES[group].some(rule => fieldFlag(group, rule.flag))
}

function applyRules (group: Group, out: GalleryExif, info: ExifInfo, asset: Asset): void {
  const enableAll = groupEnableAll(group)
  for (const rule of RULES[group]) {
    if (enableAll || fieldFlag(group, rule.flag)) rule.emit(out, info, asset)
  }
}

function groupEnableAll (group: Group): boolean {
  return !!getConfigOption(`ipp.showMetadata.${group}.enableAll`, false)
}

function fieldFlag (group: Group, flag: string): boolean {
  return !!getConfigOption(`ipp.showMetadata.${group}.${flag}`, false)
}
