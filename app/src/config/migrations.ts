/*
  Backward-compatibility shims that map legacy `config.json` key shapes
  onto their current locations. Each shim mutates the in-memory config
  only - the on-disk file is never touched, so read-only mounts are safe.

  CONVENTION for keeping this file pruneable:
    1. Every shim function starts its JSDoc with a `SHIM:` marker line.
       To list all current shims:  grep -rn 'SHIM:' app/src
    2. Every shim is registered in `SHIMS` below with the version it
       should be deleted in. When that version comes up, remove the
       function, its registry entry, and any tests for it.
    3. Each shim should be self-contained and side-effect-free beyond
       mutating the passed-in config. No imports from app code.
*/

type Config = Record<string, unknown>

interface Shim {
  name: string
  removeIn: string
  apply: (config: Config) => void
}

const SHIMS: Shim[] = [
  { name: 'lightGallery', removeIn: 'v3.0', apply: applyLightGalleryShim },
  { name: 'topLevelGallery', removeIn: 'v3.0', apply: applyTopLevelGalleryShim },
  { name: 'descriptionSplit', removeIn: 'v3.0', apply: applyDescriptionSplitShim },
  { name: 'metadataEnabled', removeIn: 'v3.0', apply: applyMetadataEnabledShim }
]

/**
 * Apply every registered legacy-config shim to `config` in place.
 * Called from `loadConfig()` after reading the file or env JSON.
 */
export function applyMigrations (config: Config): void {
  for (const shim of SHIMS) shim.apply(config)
}

/**
 * SHIM: lightGallery -> ipp.lightbox (1.x users with a legacy
 * `lightGallery.*` config section). Maps `lightGallery.controls`,
 * `lightGallery.download`, and `lightGallery.mobileSettings.controls`
 * onto `ipp.lightbox.*`.
 */
function applyLightGalleryShim (config: Config): void {
  if (!config.lightGallery || typeof config.lightGallery !== 'object') return

  const lg = config.lightGallery as Record<string, unknown>
  const mobile = (lg.mobileSettings || {}) as Record<string, unknown>
  const ipp = (config.ipp || (config.ipp = {})) as Record<string, unknown>
  const lightbox = (ipp.lightbox || (ipp.lightbox = {})) as Record<string, unknown>

  if (lightbox.showArrows === undefined && lg.controls !== undefined) {
    lightbox.showArrows = !!lg.controls
  }
  if (lightbox.showDownload === undefined && lg.download !== undefined) {
    lightbox.showDownload = !!lg.download
  }
  if (lightbox.mobileArrows === undefined && mobile.controls !== undefined) {
    lightbox.mobileArrows = !!mobile.controls
  }

  console.log(
    '[IPP] The `lightGallery` config section is deprecated; relevant keys ' +
    'have been mapped to `ipp.lightbox.*`. See README for the current options.'
  )
}

/**
 * SHIM: top-level ipp.* gallery keys -> ipp.gallery.*. Gallery-related
 * keys that used to live directly on `ipp` now live under `ipp.gallery`.
 * Maps legacy keys forward, only filling in fields the user hasn't
 * already set on the new path.
 */
function applyTopLevelGalleryShim (config: Config): void {
  const ipp = (config.ipp || (config.ipp = {})) as Record<string, unknown>
  const galleryKeyMigrations: Array<[string, string]> = [
    ['singleImageGallery', 'singleImage'],
    ['singleItemAutoOpen', 'singleItemAutoOpen'],
    ['showGalleryTitle', 'showTitle'],
    ['showGalleryDescription', 'showDescription'],
    ['groupGalleryByDate', 'groupByDate']
  ]
  const legacyPresent = galleryKeyMigrations.some(([oldKey]) => ipp[oldKey] !== undefined)
  if (!legacyPresent) return

  const gallery = (ipp.gallery || (ipp.gallery = {})) as Record<string, unknown>
  for (const [oldKey, newKey] of galleryKeyMigrations) {
    if (ipp[oldKey] !== undefined && gallery[newKey] === undefined) {
      gallery[newKey] = ipp[oldKey]
    }
  }

  console.log(
    '[IPP] Top-level gallery keys (singleImageGallery, singleItemAutoOpen, ' +
    'showGalleryTitle, showGalleryDescription, groupGalleryByDate) are ' +
    'deprecated; please move them under `ipp.gallery.*`. See README.'
  )
}

/**
 * SHIM: showMetadata.description boolean -> { caption, sidebar } object.
 * `ipp.showMetadata.description` used to be a single boolean controlling
 * both the lightbox caption and (later) the sidebar. It is now an object
 * with separate `caption` and `sidebar` flags. A legacy boolean value is
 * migrated to `{ caption: <bool>, sidebar: <bool> }` so existing configs
 * continue to render description in both places.
 */
function applyDescriptionSplitShim (config: Config): void {
  const ipp = (config.ipp || (config.ipp = {})) as Record<string, unknown>
  const showMetadata = ipp.showMetadata as Record<string, unknown> | undefined
  if (!showMetadata) return
  if (typeof showMetadata.description !== 'boolean') return

  const legacy = showMetadata.description
  showMetadata.description = { caption: legacy, sidebar: legacy }

  console.log(
    '[IPP] `ipp.showMetadata.description` as a boolean is deprecated; use ' +
    '`{ "caption": <bool>, "sidebar": <bool> }` to control each surface ' +
    'independently. See README.'
  )
}

/**
 * SHIM: showMetadata.{exif,location}.enabled removed. Per-field flags are
 * now the only gate, and they all default to `false`.
 *
 * The 2.3.0 shipped `config.json` had `enabled: false` plus every per-
 * field flag set to `true` as documentation. Without this shim those
 * `true`s would become live opt-ins on upgrade, silently exposing GPS
 * coordinates and EXIF data on share pages. The shim rewrites legacy
 * configs in memory at startup:
 *
 *   - `enabled: true`: for each known field in the group, if the per-
 *     field flag is `undefined`, set it to `true` (the old default).
 *     Explicit `false` per-field flags are kept, so "all except X"
 *     patterns continue to work.
 *   - `enabled: false`: clear any per-field flag that is `true`. Under
 *     the old semantic those flags were dead code (the master switch
 *     hid them), so wiping them preserves the "nothing visible"
 *     behaviour the user had.
 *
 * The field lists below are frozen at v2.x. If new fields are added in
 * future versions, they will not auto-appear for legacy `enabled: true`
 * users - which is the safer privacy default and matches the policy the
 * new design is establishing.
 */
const LEGACY_EXIF_FIELDS = [
  'dateTimeOriginal', 'fileName', 'dimensions', 'fileSize',
  'make', 'model', 'lensModel', 'exposureTime', 'iso',
  'fNumber', 'focalLength'
]

const LEGACY_LOCATION_FIELDS = ['city', 'state', 'country', 'gps']

function applyMetadataEnabledShim (config: Config): void {
  const ipp = (config.ipp || (config.ipp = {})) as Record<string, unknown>
  const showMetadata = ipp.showMetadata as Record<string, unknown> | undefined
  if (!showMetadata) return

  let migrated = false
  const groups: Array<[string, string[]]> = [
    ['exif', LEGACY_EXIF_FIELDS],
    ['location', LEGACY_LOCATION_FIELDS]
  ]
  for (const [groupName, fields] of groups) {
    const group = showMetadata[groupName] as Record<string, unknown> | undefined
    if (!group || typeof group !== 'object') continue
    if (group.enabled === undefined) continue

    const legacyEnabled = !!group.enabled
    delete group.enabled

    if (legacyEnabled) {
      for (const field of fields) {
        if (group[field] === undefined) group[field] = true
      }
    } else {
      for (const field of fields) {
        if (group[field] === true) group[field] = false
      }
    }

    migrated = true
  }

  if (migrated) {
    console.log(
      '[IPP] `ipp.showMetadata.exif.enabled` / `.location.enabled` are ' +
      'deprecated and have been removed. Per-field flags are now the ' +
      'only gate (all default `false`). Your legacy config has been ' +
      'rewritten in memory to preserve current behaviour; please update ' +
      'your `config.json` to the explicit per-field form. See README.'
    )
  }
}
