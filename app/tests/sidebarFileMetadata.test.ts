import { describe, expect, it } from 'vitest'
import { formatBytes } from '../src/client/sidebar'

describe('sidebar file metadata formatting', () => {
  it('uses binary unit labels for binary calculations', () => {
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1024)).toBe('1.0 KiB')
    expect(formatBytes(3_500_000)).toBe('3.3 MiB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.00 GiB')
  })
})
