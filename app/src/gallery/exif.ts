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

  Adding a new metadata field: this rules table is the server-side source
  of truth. Two other places carry parallel knowledge of the field set:
    - `client/sidebar.ts` (renderRow specs decide where the field appears
      in the info sidebar UI)
    - `config/migrations.ts` LEGACY_* arrays (frozen v2.x field list used
      by the `enabled -> per-field` shim; do NOT extend when adding new
      fields - new fields should not retroactively appear for legacy
      `enabled: true` users).
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
 * every field is an explicit per-field opt-in (all default `false`), so
 * nothing is sent unless the operator has explicitly turned on the flag.
 *
 * Returns `undefined` when no fields survive gating (so the client knows
 * there's no metadata to show).
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
 * Returns true if a metadata group has at least one per-field flag
 * explicitly set to `true` in config. Used by the sidebar visibility
 * check.
 */
export function metadataGroupActive (group: Group): boolean {
  return RULES[group].some(rule => fieldFlag(group, rule.flag))
}

function applyRules (group: Group, out: GalleryExif, info: ExifInfo, asset: Asset): void {
  for (const rule of RULES[group]) {
    if (fieldFlag(group, rule.flag)) rule.emit(out, info, asset)
  }
}

function fieldFlag (group: Group, flag: string): boolean {
  return !!getConfigOption(`ipp.showMetadata.${group}.${flag}`, false)
}
