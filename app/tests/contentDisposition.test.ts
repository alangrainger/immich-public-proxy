import { describe, it, expect } from 'vitest'
import { attachmentDisposition, filenameFromContentDisposition } from '../src/stream/download'

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

describe('attachmentDisposition', () => {
  it('percent-encodes commas and semicolons so the header stays a single value', () => {
    const header = attachmentDisposition('Yellow Aster Butte, WA; day 1.zip')
    expect(header).toBe("attachment; filename*=UTF-8''Yellow%20Aster%20Butte%2C%20WA%3B%20day%201.zip")
  })

  it('percent-encodes the characters RFC 5987 excludes from attr-char', () => {
    expect(attachmentDisposition("it's (1)*.jpg")).toBe("attachment; filename*=UTF-8''it%27s%20%281%29%2A.jpg")
  })

  it('round-trips through filenameFromContentDisposition', () => {
    const name = "Photo été, #2 & 'friends' (100%).jpg"
    expect(filenameFromContentDisposition(attachmentDisposition(name))).toBe(name)
  })
})
