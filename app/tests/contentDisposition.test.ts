import { describe, it, expect } from 'vitest'
import { filenameFromContentDisposition } from '../src/stream/download'

// Used by the zip download path to recover the real filename for album grid
// assets (which arrive without originalFileName) from the /original response.

describe('filenameFromContentDisposition', () => {
  it('prefers the RFC 5987 filename* form and percent-decodes it', () => {
    const header = "attachment; filename=\"IMG.jpg\"; filename*=UTF-8''Photo%20%C3%A9t%C3%A9.jpg"
    expect(filenameFromContentDisposition(header)).toBe('Photo été.jpg')
  })

  it('falls back to the plain quoted filename', () => {
    expect(filenameFromContentDisposition('attachment; filename="IMG_1234.HEIC"')).toBe('IMG_1234.HEIC')
  })

  it('handles an unquoted plain filename', () => {
    expect(filenameFromContentDisposition('attachment; filename=clip.mp4')).toBe('clip.mp4')
  })

  it('returns undefined when no filename is present', () => {
    expect(filenameFromContentDisposition('attachment')).toBeUndefined()
    expect(filenameFromContentDisposition(null)).toBeUndefined()
  })
})
