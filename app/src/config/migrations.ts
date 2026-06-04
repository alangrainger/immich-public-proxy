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
  { name: 'enableAll', removeIn: 'v3.0', apply: applyEnableAllShim }
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
 * SHIM: showMetadata.{exif,location}.enabled -> .enableAll, with per-
 * field defaults flipped from `true` to `false`.
 *
 * New semantics: `enableAll: true` shows every field in the group;
 * `enableAll: false` shows only fields with an explicit per-field `true`.
 *
 * Two compatibility hazards the shim guards against:
 *   (a) Old shipped `config.json` used `enabled: false` with every
 *       per-field flag set to `true` as documentation. Under new
 *       semantics those would become live opt-ins. When the legacy
 *       `enabled` was `false`, the shim zeroes out per-field flags so
 *       the runtime keeps the "nothing visible" behaviour the user had.
 *   (b) `enabled: true` with selective per-field `false` (e.g. to hide
 *       GPS while showing the rest of location) is no longer expressible
 *       because `enableAll: true` overrides per-field flags. The shim
 *       can't preserve that without enumerating every other field; we
 *       just log a warning telling the user to rewrite as explicit
 *       opt-ins.
 */
function applyEnableAllShim (config: Config): void {
  const ipp = (config.ipp || (config.ipp = {})) as Record<string, unknown>
  const showMetadata = ipp.showMetadata as Record<string, unknown> | undefined
  if (!showMetadata) return

  let migrated = false
  for (const groupName of ['exif', 'location']) {
    const group = showMetadata[groupName] as Record<string, unknown> | undefined
    if (!group || typeof group !== 'object') continue
    if (group.enabled === undefined) continue

    const legacyEnabled = !!group.enabled
    if (group.enableAll === undefined) {
      group.enableAll = legacyEnabled
    }
    delete group.enabled

    // Hazard (a): zero out per-field flags when the legacy master was
    // off. Under the old semantic those flags were dead code, so wiping
    // them is a no-op behaviour-wise but stops the new semantic from
    // treating them as live opt-ins.
    if (!legacyEnabled) {
      for (const key of Object.keys(group)) {
        if (key === 'enableAll') continue
        if (typeof group[key] === 'boolean') group[key] = false
      }
    }

    migrated = true
  }

  if (migrated) {
    console.log(
      '[IPP] `ipp.showMetadata.exif.enabled` / `.location.enabled` are ' +
      'deprecated; renamed to `enableAll`. Per-field defaults are now ' +
      '`false` and `enableAll: true` overrides them, so any per-field ' +
      '`false` that used to subtract from an all-on group is now ignored. ' +
      'See README to rewrite "show all except X" as explicit opt-ins.'
    )
  }
}
