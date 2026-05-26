import dayjs from 'dayjs'
import { Response } from 'express-serve-static-core'
import { DownloadAll, SharedLink } from './types'

let config: { [key: string]: unknown } = {}
try {
  if (process.env.CONFIG) {
    // Attempt to parse docker-compose config string into JSON (if specified)
    config = JSON.parse(process.env.CONFIG)
  } else {
    const configJson = require(process.env.IPP_CONFIG || '../config.json')
    if (typeof configJson === 'object') config = configJson
  }
} catch (e) {
  console.log(e)
}

// Backward-compatability shim for 1.x users with a legacy `lightGallery.*` config section
if (config.lightGallery && typeof config.lightGallery === 'object') {
  const lg = config.lightGallery as Record<string, unknown>
  const mobile = (lg.mobileSettings || {}) as Record<string, unknown>
  const ipp = (config.ipp || (config.ipp = {})) as Record<string, unknown>
  const lightbox = (ipp.lightbox || (ipp.lightbox = {})) as Record<string, unknown>
  // Only fill in fields the user hasn't already set on ipp.lightbox.
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

// Backward-compat shim: gallery-related keys that used to live directly on
// `ipp` now live under `ipp.gallery`. Map legacy keys forward, only filling
// in fields the user hasn't already set on the new path.
{
  const ipp = (config.ipp || (config.ipp = {})) as Record<string, unknown>
  const galleryKeyMigrations: Array<[string, string]> = [
    ['singleImageGallery', 'singleImage'],
    ['singleItemAutoOpen', 'singleItemAutoOpen'],
    ['showGalleryTitle', 'showTitle'],
    ['showGalleryDescription', 'showDescription'],
    ['groupGalleryByDate', 'groupByDate']
  ]
  const legacyPresent = galleryKeyMigrations.some(([oldKey]) => ipp[oldKey] !== undefined)
  if (legacyPresent) {
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
}

/**
 * Get a configuration option fron config.json using dotted notation.
 *
 * @param path
 * @param [defaultOption] - Specify a default option to return if no configuation value is found
 *
 * @example
 * getConfigOption('ipp.gallery.singleImage')
 */
export const getConfigOption = (path: string, defaultOption?: unknown) => {
  const value = path.split('.').reduce((obj: { [key: string]: unknown }, key) => (obj || {})[key], config)
  if (value === undefined) {
    return defaultOption
  } else {
    return value
  }
}

/**
 * Output a console.log message with timestamp
 */
export const log = (message: string) => console.log(dayjs().format() + ' ' + message)

/**
 * Force a value to be a string
 */
export function toString (value: unknown) {
  return typeof value === 'string' ? value : ''
}

/**
 * Add response headers from config.json
 */
export function addResponseHeaders (res: Response) {
  Object.entries(getConfigOption('ipp.responseHeaders', {}) as { [key: string]: string })
    .forEach(([header, value]) => {
      res.set(header, value)
    })
}

export function canDownload (share: SharedLink) {
  const allowDownloadConfig = getConfigOption('ipp.allowDownloadAll', 0) as DownloadAll
  if (!allowDownloadConfig) {
    // Downloading is disabled in config.json
    return false
  } else if (allowDownloadConfig === DownloadAll.always) {
    // Always allowed to download in config.json
    return true
  } else {
    // Return Immich's setting for this shared link
    return !!share.allowDownload
  }
}

export function escapeHtml (str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
