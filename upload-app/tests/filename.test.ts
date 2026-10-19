import { describe, it, expect } from 'vitest'
import { isUsableSeparator, uploaderSlug, uploadFilename } from '../src/filename'

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

  it('removes zero-width and direction-changing characters', () => {
    expect(uploadFilename('holiday\u202Egpj.mp4', '')).toBe('holidaygpj.mp4')
    expect(uploadFilename('IMG\u200B_0042\uFEFF.jpg', '')).toBe('IMG_0042.jpg')
    // Only format characters go: a bidi override cannot hide a dotfile
    expect(uploadFilename('\u202E.htaccess', '')).toBeUndefined()
  })

  it('normalises to NFC so one name has one spelling', () => {
    expect(uploadFilename('Cafe\u0301.jpg', '')).toBe('Caf\u00E9.jpg')
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

  it('puts the uploader after the prefix, and leaves a file that already carries the prefix alone', () => {
    expect(uploadFilename('IMG_0042.jpg', 'ipp_upload_', 'jane-smith')).toBe('ipp_upload_jane-smith,IMG_0042.jpg')
    expect(uploadFilename('IMG_0042.jpg', '', 'jane-smith')).toBe('jane-smith,IMG_0042.jpg')
    expect(uploadFilename('ipp_upload_IMG_0042.jpg', 'ipp_upload_', 'jane-smith')).toBe('ipp_upload_IMG_0042.jpg')
  })

  it('writes no header without a name, so an anonymous file is unchanged from 4.0', () => {
    expect(uploadFilename('IMG_0042.jpg', 'ipp_upload_', '')).toBe('ipp_upload_IMG_0042.jpg')
  })

  it('removes the separator from the visitor filename, so it only ever ends a field', () => {
    expect(uploadFilename('Paris, France.jpg', 'ipp_upload_')).toBe('ipp_upload_Paris France.jpg')
    expect(uploadFilename('a,b,c.jpg', 'ipp_upload_', 'jane-smith')).toBe('ipp_upload_jane-smith,abc.jpg')
    // Any other punctuation is an ordinary character and stays
    expect(uploadFilename('best^photo.jpg', 'ipp_upload_', 'jane-smith')).toBe('ipp_upload_jane-smith,best^photo.jpg')
  })

  it('uses the configured separator, and removes that one instead', () => {
    expect(uploadFilename('IMG_0042.jpg', 'ipp_upload_', 'jane-smith', '^')).toBe('ipp_upload_jane-smith^IMG_0042.jpg')
    expect(uploadFilename('Paris, France^2.jpg', 'ipp_upload_', 'jane-smith', '^')).toBe('ipp_upload_jane-smith^Paris, France2.jpg')
  })

  it('stays within 254 characters with the extension intact', () => {
    const result = uploadFilename('x'.repeat(400) + '.jpg', 'ipp_upload_') || ''
    expect(result.startsWith('ipp_upload_')).toBe(true)
    expect(result.endsWith('.jpg')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(254)
  })
})

describe('uploaderSlug', () => {
  it('makes a lower-case hyphenated slug', () => {
    expect(uploaderSlug('Jane Smith')).toBe('jane-smith')
    expect(uploaderSlug("  O'Brien, Pat  ")).toBe('o-brien-pat')
  })

  it('keeps letters and digits in any script', () => {
    expect(uploaderSlug('Zoë Müller 2')).toBe('zoë-müller-2')
    expect(uploaderSlug('山田 太郎')).toBe('山田-太郎')
  })

  it('never keeps a separator, punctuation or an underscore', () => {
    expect(uploaderSlug('Smith, Jane')).toBe('smith-jane')
    expect(uploaderSlug('jane^smith')).toBe('jane-smith')
    expect(uploaderSlug('jane_smith')).toBe('jane-smith')
  })

  it('removes zero-width and direction-changing characters', () => {
    expect(uploaderSlug('ja\u200Bne\u202E')).toBe('jane')
  })

  it('is empty for nothing usable or non-string input', () => {
    expect(uploaderSlug('')).toBe('')
    expect(uploaderSlug('!!!')).toBe('')
    expect(uploaderSlug(undefined)).toBe('')
    expect(uploaderSlug(['jane'])).toBe('')
  })

  it('is at most 32 characters, with no hyphen left at the end', () => {
    expect(uploaderSlug('a'.repeat(40))).toBe('a'.repeat(32))
    expect(uploaderSlug('a'.repeat(31) + ' b')).toBe('a'.repeat(31))
  })
})

describe('isUsableSeparator', () => {
  it('accepts punctuation that sanitize keeps', () => {
    for (const separator of ['^', ',', '~', '#', '+']) expect(isUsableSeparator(separator, 'ipp_upload_')).toBe(true)
  })

  it('rejects more than one character, anything that could be part of a name or a filename, or a non-string', () => {
    for (const separator of ['', 'a', '1', '-', '.', ' ', 'x^', '^ ', '/', ':', '*', '"', '\u0000', 'ñ', '٣', '^^', '~,', '#!']) {
      expect(isUsableSeparator(separator, 'ipp_upload_')).toBe(false)
    }
    expect(isUsableSeparator(undefined, 'ipp_upload_')).toBe(false)
    expect(isUsableSeparator(1, 'ipp_upload_')).toBe(false)
  })

  it('rejects a character in the prefix, which would hide the prefix from the stacking check', () => {
    expect(isUsableSeparator('_', 'ipp_upload_')).toBe(false)
    expect(isUsableSeparator(',', 'ipp,upload ')).toBe(false)
    expect(isUsableSeparator('_', 'ipp-upload-')).toBe(true)
  })
})
