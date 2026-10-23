import { describe, it, expect, beforeEach } from 'vitest'
import { Asset, AssetType, KeyType, loadConfig, SharedLink } from '@ipp/core'
import { isPanorama } from '../src/gallery/exif'
import { buildAssetMetadata } from '../src/gallery/metadata'

function setConfig (config: unknown) {
  process.env.CONFIG = JSON.stringify(config)
  loadConfig()
}

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  key: 'k',
  keyType: KeyType.key,
  type: AssetType.image,
  isTrashed: false,
  exifInfo: { projectionType: 'EQUIRECTANGULAR' },
  ...overrides
})

const share = (showMetadata?: boolean): SharedLink => ({
  key: 'k',
  keyType: KeyType.key,
  type: 'ALBUM',
  assets: [],
  showMetadata,
  expiresAt: null
})

describe('isPanorama', () => {
  beforeEach(() => {
    delete process.env.CONFIG
    loadConfig()
  })

  it('is true for an equirectangular image, whatever the case', () => {
    expect(isPanorama(asset())).toBe(true)
    expect(isPanorama(asset({ exifInfo: { projectionType: 'equirectangular' } }))).toBe(true)
  })

  it('is false without a projection type or for another one', () => {
    expect(isPanorama(asset({ exifInfo: undefined }))).toBe(false)
    expect(isPanorama(asset({ exifInfo: { projectionType: null } }))).toBe(false)
    expect(isPanorama(asset({ exifInfo: { projectionType: 'CUBEMAP' } }))).toBe(false)
  })

  it('is false for a video', () => {
    expect(isPanorama(asset({ type: AssetType.video }))).toBe(false)
  })

  it('is false when ipp.lightbox.panorama is off', () => {
    setConfig({ ipp: { lightbox: { panorama: false } } })
    expect(isPanorama(asset())).toBe(false)
  })
})

describe('buildAssetMetadata panorama', () => {
  beforeEach(() => {
    delete process.env.CONFIG
    loadConfig()
  })

  it('flags a panorama, also when the share hides its metadata', () => {
    expect(buildAssetMetadata(asset(), share()).panorama).toBe(true)
    expect(buildAssetMetadata(asset(), share(false)).panorama).toBe(true)
  })

  it('leaves the flag out for an ordinary photo', () => {
    expect(buildAssetMetadata(asset({ exifInfo: {} }), share()).panorama).toBeUndefined()
  })
})
