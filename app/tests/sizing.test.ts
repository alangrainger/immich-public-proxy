import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AssetType, ImageSize } from '../src/types'
import type { Asset } from '../src/types'
import { resolveImageEndpoint, requiresOriginal } from '../src/gallery/sizing'

/*
  resolveImageEndpoint reads `ipp.maxDownloadQuality` and `ipp.maxZoomQuality`
  via getConfigOption, so we mock the config-access module and set the tiers per
  test rather than loading a real config file. vitest hoists vi.mock above the
  imports, so the mock is in place by the time sizing.ts resolves config/access.
*/
const cfg: Record<string, unknown> = {}
vi.mock('../src/config/access', () => ({
  getConfigOption: (path: string, fallback?: unknown) =>
    path in cfg ? cfg[path] : fallback
}))

function asset (overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a',
    key: 'k',
    keyType: 'key' as Asset['keyType'],
    type: AssetType.image,
    isTrashed: false,
    originalMimeType: 'image/jpeg',
    ...overrides
  }
}

const jpeg = asset({ originalMimeType: 'image/jpeg' })
const heic = asset({ originalMimeType: 'image/heic' }) // non-web-displayable
const gif = asset({ originalMimeType: 'image/gif' })
const video = asset({ type: AssetType.video, originalMimeType: 'video/mp4' })
const videoMimeImage = asset({ type: AssetType.image, originalMimeType: 'video/mp4' })

beforeEach(() => {
  for (const k of Object.keys(cfg)) delete cfg[k]
})

describe('requiresOriginal', () => {
  it('is true for videos, video-MIME assets and gifs, false for plain images', () => {
    expect(requiresOriginal(video)).toBe(true)
    expect(requiresOriginal(videoMimeImage)).toBe(true)
    expect(requiresOriginal(gif)).toBe(true)
    expect(requiresOriginal(jpeg)).toBe(false)
    expect(requiresOriginal(heic)).toBe(false)
  })
})

describe('thumbnail - always the grid poster, never clamped', () => {
  it('serves thumbnail as-is for every asset type', () => {
    for (const a of [jpeg, heic, gif, video, videoMimeImage]) {
      expect(resolveImageEndpoint(ImageSize.thumbnail, a)).toEqual({
        subpath: '/thumbnail', attachment: false, servedSize: ImageSize.thumbnail
      })
    }
  })
})

describe('preview', () => {
  it('serves the preview JPEG (display) regardless of ceilings', () => {
    cfg['ipp.maxDownloadQuality'] = 'preview'
    cfg['ipp.maxZoomQuality'] = 'preview'
    expect(resolveImageEndpoint(ImageSize.preview, jpeg)).toEqual({
      subpath: '/thumbnail', sizeQueryParam: 'preview', attachment: false, servedSize: ImageSize.preview
    })
  })
})

describe('original (download tier, gated by maxDownloadQuality)', () => {
  it('default (maxDownloadQuality unset => original) serves /original as attachment', () => {
    expect(resolveImageEndpoint(ImageSize.original, jpeg)).toEqual({
      subpath: '/original', attachment: true, servedSize: ImageSize.original
    })
  })

  it('maxDownloadQuality=preview downgrades to preview, still an attachment (intent=download)', () => {
    cfg['ipp.maxDownloadQuality'] = 'preview'
    expect(resolveImageEndpoint(ImageSize.original, jpeg)).toEqual({
      subpath: '/thumbnail', sizeQueryParam: 'preview', attachment: true, servedSize: ImageSize.preview
    })
  })
})

describe('fullsize (zoom tier, gated by maxZoomQuality)', () => {
  it('caps at preview when maxZoomQuality is preview (the default)', () => {
    expect(resolveImageEndpoint(ImageSize.fullsize, jpeg).servedSize).toBe(ImageSize.preview)
  })

  it('web format: fullsize resolves to the original bytes, served inline (no attachment)', () => {
    cfg['ipp.maxZoomQuality'] = 'fullsize'
    expect(resolveImageEndpoint(ImageSize.fullsize, jpeg)).toEqual({
      subpath: '/original', attachment: false, servedSize: ImageSize.original
    })
  })

  it('non-web format: fullsize resolves to the converted JPEG via ?size=fullsize', () => {
    cfg['ipp.maxZoomQuality'] = 'fullsize'
    expect(resolveImageEndpoint(ImageSize.fullsize, heic)).toEqual({
      subpath: '/thumbnail', sizeQueryParam: 'fullsize', attachment: false, servedSize: ImageSize.fullsize
    })
  })
})

describe('gif / video (requiresOriginal) - always the original file, ceilings bypassed', () => {
  it('serves preview/fullsize/original requests from /original', () => {
    cfg['ipp.maxDownloadQuality'] = 'preview' // would downgrade a normal image
    cfg['ipp.maxZoomQuality'] = 'preview'
    expect(resolveImageEndpoint(ImageSize.preview, gif).servedSize).toBe(ImageSize.original)
    expect(resolveImageEndpoint(ImageSize.fullsize, gif).servedSize).toBe(ImageSize.original)
    expect(resolveImageEndpoint(ImageSize.original, gif).servedSize).toBe(ImageSize.original)
  })

  it('keeps attachment keyed to intent: preview/fullsize display inline, original downloads', () => {
    expect(resolveImageEndpoint(ImageSize.preview, gif).attachment).toBe(false)
    expect(resolveImageEndpoint(ImageSize.original, gif).attachment).toBe(true)
  })

  it('still serves a thumbnail request as the grid poster, never the whole video', () => {
    for (const a of [gif, video, videoMimeImage]) {
      expect(resolveImageEndpoint(ImageSize.thumbnail, a).servedSize).toBe(ImageSize.thumbnail)
    }
  })
})
