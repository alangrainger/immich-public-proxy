import { describe, it, expect, beforeEach } from 'vitest'
import { KeyType, loadConfig, SharedLink } from '@ipp/core'
import { uploadHealthcheck, uploadLink } from '../src/share'

function setConfig (config: unknown) {
  process.env.CONFIG = JSON.stringify(config)
  loadConfig()
}

const share = (overrides: Partial<SharedLink> = {}): SharedLink => ({
  key: 'the-key',
  keyType: KeyType.key,
  type: 'ALBUM',
  assets: [],
  expiresAt: null,
  allowUpload: true,
  ...overrides
})

describe('uploadLink', () => {
  beforeEach(() => {
    delete process.env.CONFIG
    loadConfig()
  })

  it('assumes /upload on this hostname while ipp.uploadUrl is unset, and checks it is there', () => {
    expect(uploadLink(share())).toBe('/upload/share/the-key')
    expect(uploadHealthcheck()).toBe('/upload/healthcheck')
  })

  it('is absent when ipp.uploadUrl is empty', () => {
    setConfig({ ipp: { uploadUrl: '' } })
    expect(uploadLink(share())).toBeUndefined()
    expect(uploadHealthcheck()).toBeUndefined()
  })

  it('takes another path on this hostname, without a trailing slash', () => {
    setConfig({ ipp: { uploadUrl: '/photos-in/' } })
    expect(uploadLink(share())).toBe('/photos-in/share/the-key')
    expect(uploadHealthcheck()).toBe('/photos-in/healthcheck')
  })

  it('trusts an absolute URL without a check', () => {
    setConfig({ ipp: { uploadUrl: 'https://upload.example.com' } })
    expect(uploadHealthcheck()).toBeUndefined()
  })

  it('links a key share by its key, without a doubled slash', () => {
    setConfig({ ipp: { uploadUrl: 'https://upload.example.com/' } })
    expect(uploadLink(share())).toBe('https://upload.example.com/share/the-key')
  })

  it('links a share opened by its slug by that slug', () => {
    setConfig({ ipp: { uploadUrl: 'https://photos.example.com/upload' } })
    expect(uploadLink(share({ keyType: KeyType.slug, slug: 'holiday 2025' }))).toBe('https://photos.example.com/upload/s/holiday%202025')
  })

  it('is absent when the owner has not allowed uploads', () => {
    setConfig({ ipp: { uploadUrl: 'https://upload.example.com' } })
    expect(uploadLink(share({ allowUpload: false }))).toBeUndefined()
    expect(uploadLink(share({ allowUpload: undefined }))).toBeUndefined()
  })

  it('ignores a value that is neither an http(s) URL nor a path', () => {
    setConfig({ ipp: { uploadUrl: 'javascript:alert(1)' } })
    expect(uploadLink(share())).toBeUndefined()
    setConfig({ ipp: { uploadUrl: '//evil.example.com' } })
    expect(uploadLink(share())).toBeUndefined()
    setConfig({ ipp: { uploadUrl: '/' } })
    expect(uploadLink(share())).toBeUndefined()
    setConfig({ ipp: { uploadUrl: 42 } })
    expect(uploadLink(share())).toBeUndefined()
  })
})
