import { describe, expect, it } from 'vitest'
import { formatDate } from '../src/client/sidebar'

describe('sidebar date formatting', () => {
  const capturedAt = '2025-10-18T06:28:54.000Z'

  it('formats the capture instant in the photo IANA timezone', () => {
    const formatted = formatDate(capturedAt, 'Asia/Singapore')
    expect(formatted.date).toBe('Oct 18, 2025')
    expect(formatted.time).toContain('Sat')
    expect(formatted.time).toContain('2:28:54 PM')
    expect(formatted.time).toContain('GMT+08:00')
  })

  it('supports legacy fixed-offset timezones from Immich', () => {
    const formatted = formatDate(capturedAt, 'UTC+8')
    expect(formatted.date).toBe('Oct 18, 2025')
    expect(formatted.time).toContain('2:28:54 PM')
    expect(formatted.time).toContain('GMT+08:00')
  })

  it('retains the original value when the timestamp is invalid', () => {
    expect(formatDate('not-a-date', 'Asia/Singapore')).toEqual({ date: 'not-a-date', time: '' })
  })
})
