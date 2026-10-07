import { Asset, getConfigOption } from '@ipp/core'
import type { GroupByDateMode } from '../shared/types'

/**
 * Put a share's assets in the order the gallery renders them. Applied once,
 * when the share is loaded, so the gallery, the zip download and the single
 * download all see the same order and an asset's position is its index.
 *
 * An album with a sort order is sorted by capture time in that direction.
 * Date grouping then sorts by the local timestamp the client buckets on, so
 * buckets stay contiguous (`dateSortComparator`).
 *
 * Sorts in place and returns the same array.
 */
export function displayOrder (assets: Asset[], albumOrder?: string): Asset[] {
  if (albumOrder === 'asc') {
    assets.sort((a, b) => a?.fileCreatedAt?.localeCompare(b.fileCreatedAt || '') || 0)
  } else if (albumOrder === 'desc') {
    assets.sort((a, b) => b?.fileCreatedAt?.localeCompare(a.fileCreatedAt || '') || 0)
  }
  if (groupByDateMode()) {
    assets.sort(dateSortComparator(albumOrder))
  }
  return assets
}

/**
 * Comparator for the date-grouping sort: ascending when the album's order is
 * `'asc'`, otherwise newest-first (individual shares and orderless albums).
 * Undated assets always sort last regardless of direction, so the client's
 * "Undated" group renders at the bottom.
 */
export function dateSortComparator (order?: string): (a: Asset, b: Asset) => number {
  const ascending = order === 'asc'
  const sortKey = (a: Asset) => a.localDateTime || a.fileCreatedAt || ''
  return (a, b) => {
    const ka = sortKey(a)
    const kb = sortKey(b)
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
