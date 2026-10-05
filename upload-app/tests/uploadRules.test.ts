import { describe, it, expect } from 'vitest'
import { fileType, formatSize, isUploadableType } from '../src/shared/upload'
import { declaredLength, uploadTimestamp } from '../src/receive'

describe('isUploadableType', () => {
  it('accepts photos and videos, with or without parameters', () => {
    expect(isUploadableType('image/jpeg')).toBe(true)
    expect(isUploadableType('video/quicktime')).toBe(true)
    expect(isUploadableType('IMAGE/HEIC')).toBe(true)
    expect(isUploadableType('image/jpeg; charset=binary')).toBe(true)
  })

  it('refuses SVG, the one image type a browser may execute', () => {
    expect(isUploadableType('image/svg+xml')).toBe(false)
    expect(isUploadableType('IMAGE/SVG+XML; charset=utf-8')).toBe(false)
  })

  it('refuses anything else', () => {
    expect(isUploadableType('application/octet-stream')).toBe(false)
    expect(isUploadableType('text/html')).toBe(false)
    expect(isUploadableType('')).toBe(false)
  })
})

describe('fileType', () => {
  it('keeps the type the browser gave', () => {
    expect(fileType('IMG_0042.HEIC', 'image/heic')).toBe('image/heic')
  })

  it('derives a type from the extension when the browser gives none', () => {
    expect(fileType('IMG_0042.HEIC', '')).toBe('image/heic')
    expect(fileType('DSC_0001.NEF', '')).toBe('image/x-nikon-nef')
    expect(isUploadableType(fileType('clip.mts', ''))).toBe(true)
  })

  it('gives up on an unknown extension, so the client refuses the file', () => {
    expect(fileType('notes.txt', '')).toBe('')
  })
})

describe('formatSize', () => {
  it('picks a readable unit', () => {
    expect(formatSize(512)).toBe('512 bytes')
    expect(formatSize(3 * 1024)).toBe('3 KB')
    expect(formatSize(3145728)).toBe('3.0 MB')
    expect(formatSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB')
  })
})

describe('declaredLength', () => {
  it('reads a plain decimal Content-Length', () => {
    expect(declaredLength('3145728')).toBe(3145728)
    expect(declaredLength('0')).toBe(0)
  })

  it('rejects a missing or malformed header', () => {
    expect(declaredLength(undefined)).toBeUndefined()
    expect(declaredLength('')).toBeUndefined()
    expect(declaredLength('12abc')).toBeUndefined()
    expect(declaredLength('-1')).toBeUndefined()
    expect(declaredLength('1e9')).toBeUndefined()
  })
})

describe('uploadTimestamp', () => {
  it('passes through a valid timestamp as ISO 8601', () => {
    expect(uploadTimestamp('2026-09-14T07:18:00.000Z')).toBe('2026-09-14T07:18:00.000Z')
  })

  it('falls back to now for junk or missing input', () => {
    for (const input of ['not a date', '', undefined, 42]) {
      expect(Number.isNaN(Date.parse(uploadTimestamp(input)))).toBe(false)
    }
  })
})
