import { Asset, getConfigOption } from '@ipp/core'
import type { GroupByDateMode } from '../shared/types'

/**
 * Put a share's assets in the order the gallery renders them. Applied once,
 * when the share is loaded, so the gallery, the zip download and the single
 * download all see the same order and an asset's position is its index.
 *
 * With date grouping on, sorts by the local timestamp the client buckets on,
 * so buckets stay contiguous. Otherwise an album with a sort order is sorted
 * by capture time in that direction, and anything else keeps Immich's order.
 *
 * Sorts in place and returns the same array.
 */
export function displayOrder (assets: Asset[], albumOrder?: string): Asset[] {
  if (groupByDateMode()) {
    assets.sort(dateSortComparator(albumOrder))
  } else if (albumOrder === 'asc' || albumOrder === 'desc') {
    assets.sort(dateSortComparator(albumOrder, captureTime))
  }
  return assets
}

/** The local timestamp the client's date groups bucket on */
const localTime = (a: Asset) => a.localDateTime || a.fileCreatedAt || ''

/** The capture timestamp in UTC, which Immich sorts an album by */
const captureTime = (a: Asset) => a.fileCreatedAt || ''

/**
 * Comparator on the timestamp `key` returns: ascending when the album's order
 * is `'asc'`, otherwise newest-first (individual shares and orderless albums).
 * Undated assets always sort last regardless of direction, so the client's
 * "Undated" group renders at the bottom and the order is consistent.
 */
export function dateSortComparator (order?: string, key: (a: Asset) => string = localTime): (a: Asset, b: Asset) => number {
  const ascending = order === 'asc'
  return (a, b) => {
    const ka = key(a)
    const kb = key(b)
    if (!ka || !kb) return ka ? -1 : kb ? 1 : 0 // undated always last
    return ascending ? ka.localeCompare(kb) : kb.localeCompare(ka)
  }
}

/**
 * Normalise the operator's `ipp.gallery.groupByDate` config into a grouping
 * mode. Accepts `false` (off), `true` / `'month'` (legacy = month buckets) or
 * `'day'` (day buckets); anything else is treated as off.
 */
export function groupByDateMode (): GroupByDateMode | false {
  const v = getConfigOption('ipp.gallery.groupByDate', false)
  if (v === 'day') return 'day'
  if (v === true || v === 'month') return 'month'
  return false
}
