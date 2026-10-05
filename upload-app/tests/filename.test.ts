import { describe, it, expect } from 'vitest'
import { uploadFilename } from '../src/filename'

describe('uploadFilename', () => {
  it('keeps an ordinary filename', () => {
    expect(uploadFilename('IMG_0042.jpg', '')).toBe('IMG_0042.jpg')
  })

  it('strips path components so traversal cannot survive', () => {
    expect(uploadFilename('../../etc/passwd.jpg', '')).toBe('passwd.jpg')
    expect(uploadFilename('C:\\Users\\bob\\holiday.png', '')).toBe('holiday.png')
  })

  it('removes characters that are illegal in a filename or would break the multipart header', () => {
    expect(uploadFilename('we"rd:na*me.jpg', '')).toBe('werdname.jpg')
  })

  it('rejects a name with no extension', () => {
    expect(uploadFilename('photo', '')).toBeUndefined()
  })

  it('rejects dotfiles and non-string input', () => {
    expect(uploadFilename('.htaccess', '')).toBeUndefined()
    expect(uploadFilename('', '')).toBeUndefined()
    expect(uploadFilename(undefined, '')).toBeUndefined()
    expect(uploadFilename(['a.jpg'], '')).toBeUndefined()
  })

  it('applies the prefix once', () => {
    expect(uploadFilename('IMG_0042.jpg', 'ipp_upload_')).toBe('ipp_upload_IMG_0042.jpg')
    expect(uploadFilename('ipp_upload_IMG_0042.jpg', 'ipp_upload_')).toBe('ipp_upload_IMG_0042.jpg')
  })

  it('sanitises an operator prefix that would break the filename', () => {
    expect(uploadFilename('IMG_0042.jpg', '../ev"il/')).toBe('..evilIMG_0042.jpg')
  })

  it('stays within 254 characters with the extension intact', () => {
    const result = uploadFilename('x'.repeat(400) + '.jpg', 'ipp_upload_') || ''
    expect(result.startsWith('ipp_upload_')).toBe(true)
    expect(result.endsWith('.jpg')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(254)
  })
})
