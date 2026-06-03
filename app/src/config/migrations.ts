// Backward-compatability shims that map legacy `config.json` key shapes
// onto their current locations. Each one only fills in values the user
// hasn't explicitly set on the new path, and prints a one-time deprecation
// warning to the startup log.
//
// Delete in v3.0.

type Config = Record<string, unknown>

/**
 * Apply every supported legacy-config shim to `config` in place.
 * Called from `loadConfig()` after reading the file or env JSON.
 */
export function applyMigrations (config: Config): void {
  applyLightGalleryShim(config)
  applyTopLevelGalleryShim(config)
  applyDescriptionSplitShim(config)
}

/**
 * 1.x users with a legacy `lightGallery.*` config section.
 * Maps `lightGallery.controls`, `lightGallery.download`, and
 * `lightGallery.mobileSettings.controls` onto `ipp.lightbox.*`.
 *
 * Delete in v3.0.
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
 * Gallery-related keys that used to live directly on `ipp` now live under
 * `ipp.gallery`. Maps legacy keys forward, only filling in fields the user
 * hasn't already set on the new path.
 *
 * Delete in v3.0.
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
 * `ipp.showMetadata.description` used to be a single boolean controlling
 * both the lightbox caption and (later) the sidebar. It is now an object
 * with separate `caption` and `sidebar` flags. A legacy boolean value is
 * migrated to `{ caption: <bool>, sidebar: <bool> }` so existing configs
 * continue to render description in both places.
 *
 * Delete in v3.0.
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
