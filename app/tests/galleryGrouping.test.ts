import { describe, it, expect, beforeEach } from 'vitest'
import { state } from '../src/client/state'
import { computeLayout } from '../src/client/layout'
import type { GalleryItem, GroupByDateMode } from '../src/shared/types'

/*
 * Exercises the date-grouping generalisation in client/layout.ts: month vs day
 * bucketing, the localDateTime-over-fileCreatedAt precedence (the timezone
 * boundary case), and the "all undated" header suppression. We assert on the
 * bucket structure (header count / order) rather than the localised label
 * strings, which vary with the test runner's locale.
 */

function item (partial: Partial<GalleryItem>): GalleryItem {
  return {
    id: partial.id || Math.random().toString(),
    type: 'IMAGE',
    previewUrl: '',
    thumbnailUrl: '',
    downloadFilename: '',
    width: 1000,
    height: 800,
    ...partial
  }
}

function labelsFor (items: GalleryItem[], mode: GroupByDateMode | false): Array<string> {
  state.items = items
  state.groupByDate = mode
  // Desktop width so the justified-rows path runs; grouping is width-agnostic.
  return computeLayout(1200).headers.map(h => h.label)
}

describe('gallery date grouping', () => {
  beforeEach(() => {
    state.items = []
    state.groupByDate = false
  })

  it('produces no headers when grouping is off', () => {
    const items = [
      item({ localDateTime: '2024-12-25T10:00:00.000Z' }),
      item({ localDateTime: '2024-11-01T10:00:00.000Z' })
    ]
    expect(labelsFor(items, false)).toEqual([])
  })

  it('buckets by month, collapsing same-month days into one header', () => {
    const items = [
      item({ localDateTime: '2024-12-25T10:00:00.000Z' }),
      item({ localDateTime: '2024-12-02T10:00:00.000Z' }),
      item({ localDateTime: '2024-11-30T10:00:00.000Z' })
    ]
    // Dec + Nov = 2 month headers
    expect(labelsFor(items, 'month')).toHaveLength(2)
  })

  it('buckets by day, giving each distinct day its own header', () => {
    const items = [
      item({ localDateTime: '2024-12-25T10:00:00.000Z' }),
      item({ localDateTime: '2024-12-02T10:00:00.000Z' }),
      item({ localDateTime: '2024-11-30T10:00:00.000Z' })
    ]
    expect(labelsFor(items, 'day')).toHaveLength(3)
  })

  it('prefers localDateTime over fileCreatedAt for the bucket (timezone boundary)', () => {
    // Shot at 23:00 local on the 25th; stored UTC ticks over to the 26th.
    // Day grouping must follow the local date, so both land under the 25th.
    const items = [
      item({ localDateTime: '2024-12-25T23:00:00.000Z', fileCreatedAt: '2024-12-26T04:00:00.000Z' }),
      item({ localDateTime: '2024-12-25T21:00:00.000Z', fileCreatedAt: '2024-12-26T02:00:00.000Z' })
    ]
    expect(labelsFor(items, 'day')).toHaveLength(1)
  })

  it('falls back to fileCreatedAt when localDateTime is absent', () => {
    const items = [
      item({ fileCreatedAt: '2024-12-25T10:00:00.000Z' }),
      item({ fileCreatedAt: '2024-11-30T10:00:00.000Z' })
    ]
    expect(labelsFor(items, 'month')).toHaveLength(2)
  })

  it('suppresses the lone header when every item is undated', () => {
    const items = [item({}), item({})]
    // One "undated" bucket, but its header is dropped -> label is null
    const labels = labelsFor(items, 'day')
    expect(labels).toEqual([])
  })
})
