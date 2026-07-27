import { describe, it, expect } from 'vitest'
import { dateSortComparator } from '../src/gallery/builder'
import { Asset, AssetType, KeyType } from '../src/types'

/*
  The date-grouping sort must follow the album's own order while
  keeping undated assets last in BOTH directions.
*/

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
