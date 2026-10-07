import { describe, it, expect, afterEach } from 'vitest'
import { Asset, AssetType, KeyType, loadConfig } from '@ipp/core'
import { dateSortComparator, displayOrder } from '../src/gallery/order'

/*
  The date-grouping sort must follow the album's own order while
  keeping undated assets last in BOTH directions. displayOrder applies it,
  after the album's own sort, when `gallery.groupByDate` is on.
*/

afterEach(() => {
  delete process.env.CONFIG
  loadConfig()
})

const asset = (localDateTime?: string): Asset => ({
  id: localDateTime || 'undated',
  key: 'k',
  keyType: KeyType.key,
  type: AssetType.image,
  isTrashed: false,
  localDateTime
})

const dates = (assets: Asset[]) => assets.map(a => a.localDateTime || 'UNDATED')

const mixed = () => [
  asset('2024-06-01T10:00:00.000Z'),
  asset(),
  asset('2024-01-01T10:00:00.000Z'),
  asset('2025-03-01T10:00:00.000Z')
]

describe('dateSortComparator', () => {
  it('defaults to newest-first with no album order', () => {
    expect(dates(mixed().sort(dateSortComparator(undefined)))).toEqual(
      ['2025-03-01T10:00:00.000Z', '2024-06-01T10:00:00.000Z', '2024-01-01T10:00:00.000Z', 'UNDATED'])
  })

  it('sorts oldest-first for asc albums', () => {
    expect(dates(mixed().sort(dateSortComparator('asc')))).toEqual(
      ['2024-01-01T10:00:00.000Z', '2024-06-01T10:00:00.000Z', '2025-03-01T10:00:00.000Z', 'UNDATED'])
  })

  it('sorts newest-first for desc albums', () => {
    expect(dates(mixed().sort(dateSortComparator('desc')))).toEqual(
      ['2025-03-01T10:00:00.000Z', '2024-06-01T10:00:00.000Z', '2024-01-01T10:00:00.000Z', 'UNDATED'])
  })

  it('keeps undated assets last in both directions', () => {
    const withUndatedFirst = [asset(), asset('2024-01-01T10:00:00.000Z')]
    expect(dates([...withUndatedFirst].sort(dateSortComparator('asc')))).toEqual(
      ['2024-01-01T10:00:00.000Z', 'UNDATED'])
    expect(dates([...withUndatedFirst].sort(dateSortComparator(undefined)))).toEqual(
      ['2024-01-01T10:00:00.000Z', 'UNDATED'])
  })

  it('falls back to fileCreatedAt when localDateTime is missing', () => {
    const a: Asset = { ...asset(), fileCreatedAt: '2024-05-01T10:00:00.000Z' }
    const b = asset('2024-01-01T10:00:00.000Z')
    const sorted = [a, b].sort(dateSortComparator('asc'))
    expect(sorted[0]).toBe(b)
    expect(sorted[1]).toBe(a)
  })
})

describe('displayOrder', () => {
  const dated = (id: string, fileCreatedAt: string, localDateTime?: string): Asset =>
    ({ ...asset(localDateTime), id, fileCreatedAt })
  // Capture order c, a, b; local time disagrees for b (shot late at night)
  const album = () => [
    dated('a', '2024-02-01T10:00:00.000Z'),
    dated('b', '2024-03-01T01:00:00.000Z', '2024-01-31T23:00:00.000Z'),
    dated('c', '2024-01-01T10:00:00.000Z')
  ]
  const ids = (assets: Asset[]) => assets.map(a => a.id)

  it('leaves an orderless share as Immich returned it', () => {
    expect(ids(displayOrder(album()))).toEqual(['a', 'b', 'c'])
  })

  it('sorts an album by capture time in its own direction', () => {
    expect(ids(displayOrder(album(), 'asc'))).toEqual(['c', 'a', 'b'])
    expect(ids(displayOrder(album(), 'desc'))).toEqual(['b', 'a', 'c'])
  })

  it('sorts by local time when date grouping is on, so buckets stay contiguous', () => {
    process.env.CONFIG = JSON.stringify({ ipp: { gallery: { groupByDate: 'day' } } })
    loadConfig()
    expect(ids(displayOrder(album(), 'asc'))).toEqual(['c', 'b', 'a'])
    // Newest-first without an album order
    expect(ids(displayOrder(album()))).toEqual(['a', 'b', 'c'])
  })

  it('sorts in place and returns the same array', () => {
    const assets = album()
    expect(displayOrder(assets, 'asc')).toBe(assets)
  })
})
