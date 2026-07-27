import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { localDateTimeFromOffset } from '../src/immich'

/*
  Regression test for the timeline date-grouping skew: Immich's timeline
  bucket API returns fileCreatedAt as a zone-less UTC string
  ('2024-12-11T07:41:54'), which Date.parse treats as server-local time.
  On a non-UTC host every reconstructed localDateTime shifted by the
  host's UTC offset, putting assets under the wrong date-group header
  (e.g. a "10 Dec" header over photos whose sidebar said 11 Dec).

  TZ is pinned to a far-from-UTC zone so the suite fails if the parse
  ever becomes host-local again, regardless of the machine running it.
*/

const originalTz = process.env.TZ

beforeAll(() => {
  process.env.TZ = 'Pacific/Auckland' // UTC+12/+13
})

afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

describe('localDateTimeFromOffset', () => {
  it('treats zone-less timeline timestamps as UTC, not server-local', () => {
    expect(localDateTimeFromOffset('2024-12-11T07:41:54', 0)).toBe('2024-12-11T07:41:54.000Z')
  })

  it('applies the photographer offset to the UTC instant', () => {
    expect(localDateTimeFromOffset('2024-12-10T15:30:00', 8)).toBe('2024-12-10T23:30:00.000Z')
    expect(localDateTimeFromOffset('2024-12-11T03:30:00', -8)).toBe('2024-12-10T19:30:00.000Z')
  })

  it('leaves explicitly zoned timestamps alone', () => {
    expect(localDateTimeFromOffset('2024-12-11T07:41:54Z', 0)).toBe('2024-12-11T07:41:54.000Z')
    expect(localDateTimeFromOffset('2024-12-11T07:41:54+00:00', 0)).toBe('2024-12-11T07:41:54.000Z')
  })

  it('returns undefined for missing or invalid input', () => {
    expect(localDateTimeFromOffset(undefined, 0)).toBeUndefined()
    expect(localDateTimeFromOffset('not-a-date', 0)).toBeUndefined()
  })
})
