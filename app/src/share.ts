import { Asset, getConfigOption, KeyType, log, SharedLink, TtlLruCache } from '@ipp/core'
import { DownloadAll } from './types'
import dayjs from 'dayjs'

/**
 * Decide whether the given shared link's download UI is shown (the "download
 * all" zip, multi-select download, and the per-asset lightbox button). The
 * `ipp.allowDownload` config controls the policy: disabled, follow the
 * per-share Immich setting, or always allowed. This is purely a UI gate - it
 * does not affect image quality (see `gallery/sizing.ts`).
 */
export function canDownload (share: SharedLink): boolean {
  const policy = getConfigOption('ipp.allowDownload', DownloadAll.disabled)
  if (policy === DownloadAll.always) return true
  if (policy === DownloadAll.perImmich) return !!share.allowDownload
  if (policy !== DownloadAll.disabled && !warnedInvalidDownloadPolicy) {
    warnedInvalidDownloadPolicy = true
    log.warn('ipp.allowDownload is ' + JSON.stringify(policy) + ', which is not 0, 1 or 2. Downloads are off.')
  }
  return false
}

let warnedInvalidDownloadPolicy = false

/**
 * The "Add photos" link to this share on the upload service, or undefined
 * when `ipp.uploadUrl` is unset or not an http(s) URL, or the owner has not
 * turned on "Allow public user to upload". A share opened by its slug links
 * by its slug, so the upload service resolves it the same way.
 */
export function uploadLink (share: SharedLink): string | undefined {
  const configured = getConfigOption('ipp.uploadUrl', '')
  if (!share.allowUpload || typeof configured !== 'string' || !/^https?:\/\//i.test(configured.trim())) return undefined
  const base = configured.trim().replace(/\/+$/, '')
  return share.keyType === KeyType.slug && share.slug
    ? base + '/s/' + encodeURIComponent(share.slug)
    : base + '/share/' + encodeURIComponent(share.key)
}

// Asset ids already warned about, so each warns at most once a day
const warnedUnprocessed = new TtlLruCache<true>({ ttlMs: 24 * 60 * 60_000, max: 1000 })

/**
 * Narrow a share's assets to what IPP can render: not trashed, and finished
 * processing in Immich. `thumbhash` is the readiness signal: Immich's
 * thumbnail job writes the files and only then sets it, so until it appears
 * every image URL IPP hands out would 404.
 */
export function servableAssets (assets: Asset[]): Asset[] {
  return assets.filter(asset => {
    if (asset.isTrashed) return false
    if (asset.thumbhash) return true
    if (!warnedUnprocessed.get(asset.id)) {
      warnedUnprocessed.set(asset.id, true)
      log.warn('Asset ' + asset.id + ' is hidden because Immich has not generated its thumbnail yet. ' +
        'If it never appears, check the thumbnail job for that asset in Immich.')
    }
    return false
  })
}

const DEFAULT_EXPIRY_FORMAT = 'YYYY-MM-DD'

/**
 * Formatted expiry date for the gallery subtitle, or undefined when the
 * feature is off, the share never expires, or the date can't be parsed.
 *
 * Gated by `ipp.gallery.showExpiryDate` (default `false`). Formatted with the
 * dayjs format string `ipp.gallery.expiryDateFormat` (default ISO 8601 date
 * `YYYY-MM-DD`, e.g. `2026-07-10`). Name-based tokens (e.g. `MMMM` -> "July")
 * render in the operator's `ipp.gallery.expiryDateLocale` when set, otherwise
 * dayjs's default English.
 */
export function expiryDate (share: SharedLink): string | undefined {
  if (!getConfigOption('ipp.gallery.showExpiryDate', false)) return undefined
  if (!share.expiresAt) return undefined
  const parsed = dayjs(share.expiresAt)
  if (!parsed.isValid()) return undefined
  const configured = getConfigOption('ipp.gallery.expiryDateFormat', DEFAULT_EXPIRY_FORMAT)
  const format = typeof configured === 'string' && configured ? configured : DEFAULT_EXPIRY_FORMAT
  const locale = expiryDateLocale()
  return (locale ? parsed.locale(locale) : parsed).format(format)
}

/**
 * Resolve and lazily load the dayjs locale named by `ipp.gallery.expiryDateLocale`
 * so name-based expiry tokens localise. Returns the locale name to apply, or
 * undefined to keep dayjs's default (English) - including when the value is not
 * a valid, bundled dayjs locale. Node caches the require, so repeat lookups for
 * the same locale are cheap.
 */
function expiryDateLocale (): string | undefined {
  const configured = getConfigOption('ipp.gallery.expiryDateLocale', '')
  if (typeof configured !== 'string' || !configured) return undefined
  // dayjs locale files are lowercase (e.g. `en-gb.js`); normalise `en-GB` etc.
  const name = configured.toLowerCase()
  // Constrain to dayjs-shaped locale names (e.g. `de`, `en-gb`, `pt-br`); this
  // also blocks the config value from reaching require() as a traversal path.
  if (!/^[a-z]{2,3}(-[a-z]{2,4})?$/.test(name)) return undefined
  try {
    require('dayjs/locale/' + name)
    return name
  } catch {
    return undefined
  }
}

/**
 * Find the shared still that a motion photo (Live Photo) clip belongs to. The
 * clip is a hidden asset that Immich authorises under the same share key;
 * requiring a shared still to point at it keeps the ids IPP serves bounded.
 */
export function findMotionPhotoStill (share: SharedLink, clipId: string): Asset | undefined {
  if (!clipId) return undefined
  return share.assets.find(asset => asset.livePhotoVideoId === clipId)
}
