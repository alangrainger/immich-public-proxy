import { describe, expect, it } from 'vitest'
import { formatDate, formatWallClock } from '../src/client/sidebar'

// The locale is pinned to en-US throughout: formatDate follows the system
// locale by default, which would make these assertions machine-dependent.

describe('sidebar date formatting', () => {
  const capturedAt = '2025-10-18T06:28:54.000Z'

  it('formats the capture instant in the photo IANA timezone', () => {
    const formatted = formatDate(capturedAt, 'Asia/Singapore', 'en-US')
    expect(formatted.date).toBe('Oct 18, 2025')
    expect(formatted.time).toContain('Sat')
    expect(formatted.time).toContain('2:28:54 PM')
    expect(formatted.time).toContain('GMT+08:00')
  })

  it('supports legacy fixed-offset timezones from Immich', () => {
    const formatted = formatDate(capturedAt, 'UTC+8', 'en-US')
    expect(formatted.date).toBe('Oct 18, 2025')
    expect(formatted.time).toContain('2:28:54 PM')
    expect(formatted.time).toContain('GMT+08:00')
  })

  it('falls back to local formatting for an unknown timezone', () => {
    const formatted = formatDate(capturedAt, 'Not/AZone', 'en-US')
    expect(formatted.date).toMatch(/Oct 1[78], 2025/)
    expect(formatted.time).toContain(':28:54')
  })

  it('retains the original value when the timestamp is invalid', () => {
    expect(formatDate('not-a-date', 'Asia/Singapore', 'en-US')).toEqual({ date: 'not-a-date', time: '' })
  })
})

describe('sidebar wall-clock formatting', () => {
  // localDateTime carries the photographer's wall-clock with a nominal Z;
  // it must render exactly as written, with no offset label, for any viewer.
  it('renders the wall-clock as written with no offset label', () => {
    const formatted = formatWallClock('2024-12-10T23:30:00.000Z', 'en-US')
    expect(formatted.date).toBe('Dec 10, 2024')
    expect(formatted.time).toContain('11:30:00 PM')
    expect(formatted.time).not.toContain('GMT')
  })

  it('retains the original value when the timestamp is invalid', () => {
    expect(formatWallClock('not-a-date', 'en-US')).toEqual({ date: 'not-a-date', time: '' })
  })
})
