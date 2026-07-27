import { describe, it, expect, beforeEach } from 'vitest'
import { buildAssetMetadata } from '../src/gallery/metadata'
import { loadConfig } from '../src/config/loader'
import { Asset, AssetType, KeyType, SharedLink } from '../src/types'

// buildAssetMetadata is the lazy-flow counterpart to the gallery builder's
// per-item baking; it must apply the same showMetadata kill-switch and
// ipp.showMetadata.* gating so nothing leaks that the operator didn't opt into.

function setConfig (config: unknown) {
  process.env.CONFIG = JSON.stringify(config)
  loadConfig()
}

const asset = (): Asset => ({
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  key: 'k',
  keyType: KeyType.key,
  type: AssetType.image,
  isTrashed: false,
  originalFileName: 'IMG_1234.HEIC',
  originalMimeType: 'image/heic',
  exifInfo: {
    description: 'A nice photo',
    dateTimeOriginal: '2025-10-18T06:28:54.000Z',
    timeZone: 'Asia/Singapore',
    make: 'Canon',
    model: 'EOS R5',
    city: 'Paris',
    country: 'France',
    latitude: 48.8,
    longitude: 2.3
  }
})

const share = (showMetadata?: boolean): SharedLink => ({
  key: 'k',
  keyType: KeyType.key,
  type: 'ALBUM',
  assets: [],
  showMetadata,
  expiresAt: null
})

describe('buildAssetMetadata', () => {
  beforeEach(() => {
    delete process.env.CONFIG
    loadConfig()
  })

  it('returns exif when the matching per-field flags are enabled', () => {
    setConfig({ ipp: { showMetadata: { exif: { make: true, model: true } } } })
    const meta = buildAssetMetadata(asset(), share())
    expect(meta.exif?.make).toBe('Canon')
    expect(meta.exif?.model).toBe('EOS R5')
    // location not enabled -> absent
    expect(meta.exif?.city).toBeUndefined()
  })

  // Immich 3.x applies EXIF orientation before storing asset.width / height,
  // so a rotated photo reports portrait dimensions there while the exifImage*
  // pair stays landscape. The asset-level pair must win.
  it('reports dimensions in display orientation', () => {
    setConfig({ ipp: { showMetadata: { exif: { dimensions: true } } } })
    const photo = asset()
    photo.width = 3000
    photo.height = 4000
    photo.exifInfo!.exifImageWidth = 4000
    photo.exifInfo!.exifImageHeight = 3000
    photo.exifInfo!.orientation = '6'

    expect(buildAssetMetadata(photo, share()).exif).toMatchObject({
      width: 3000,
      height: 4000
    })
  })

  // Immich 2.x has no asset-level width / height, so the raw EXIF pair is
  // used, swapped when the orientation marks the image as stored rotated.
  const exifOrientationCases: Array<[string | null, number, number]> = [
    ['6', 3000, 4000],
    ['8', 3000, 4000],
    ['90', 3000, 4000],
    ['-90', 3000, 4000],
    ['1', 4000, 3000],
    [null, 4000, 3000]
  ]

  it.each(exifOrientationCases)('falls back to swapped exif dimensions without asset dimensions (orientation %s)', (orientation, width, height) => {
    setConfig({ ipp: { showMetadata: { exif: { dimensions: true } } } })
    const photo = asset()
    photo.exifInfo!.exifImageWidth = 4000
    photo.exifInfo!.exifImageHeight = 3000
    photo.exifInfo!.orientation = orientation

    expect(buildAssetMetadata(photo, share()).exif).toMatchObject({ width, height })
  })

  it('returns the photo timezone only when both date and timezone are enabled', () => {
    setConfig({ ipp: { showMetadata: { exif: { dateTimeOriginal: true, timezone: true } } } })
    const meta = buildAssetMetadata(asset(), share())
    expect(meta.exif?.dateTimeOriginal).toBe('2025-10-18T06:28:54.000Z')
    expect(meta.exif?.timeZone).toBe('Asia/Singapore')

    setConfig({ ipp: { showMetadata: { exif: { dateTimeOriginal: true } } } })
    expect(buildAssetMetadata(asset(), share()).exif?.timeZone).toBeUndefined()

    setConfig({ ipp: { showMetadata: { exif: { timezone: true } } } })
    expect(buildAssetMetadata(asset(), share()).exif).toBeUndefined()
  })

  it('returns description when a description surface is enabled', () => {
    setConfig({ ipp: { showMetadata: { description: { sidebar: true } } } })
    const meta = buildAssetMetadata(asset(), share())
    expect(meta.description).toBe('A nice photo')
  })

  it('suppresses everything when the share showMetadata is false', () => {
    setConfig({ ipp: { showMetadata: { exif: { make: true }, description: { sidebar: true } } } })
    const meta = buildAssetMetadata(asset(), share(false))
    expect(meta.exif).toBeUndefined()
    expect(meta.description).toBeUndefined()
    // filename is still returned (not gated by showMetadata - it's a download
    // affordance, mirroring the eager builder's downloadFilename)
    expect(meta.downloadFilename).toBeTruthy()
  })

  it('always returns a download filename', () => {
    setConfig({})
    const meta = buildAssetMetadata(asset(), share())
    // HEIC original served as preview JPEG when downloadOriginalPhoto defaults on
    expect(meta.downloadFilename).toMatch(/IMG_1234/)
  })
})
