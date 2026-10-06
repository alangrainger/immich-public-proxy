import { describe, it, expect, beforeEach } from 'vitest'
import { KeyType, loadConfig, SharedLink } from '@ipp/core'
import { uploadLink } from '../src/share'

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

  it('is absent while ipp.uploadUrl is unset', () => {
    expect(uploadLink(share())).toBeUndefined()
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

  it('ignores a value that is not an http(s) URL', () => {
    setConfig({ ipp: { uploadUrl: 'javascript:alert(1)' } })
    expect(uploadLink(share())).toBeUndefined()
    setConfig({ ipp: { uploadUrl: 42 } })
    expect(uploadLink(share())).toBeUndefined()
  })
})
