import { describe, it, expect, vi } from 'vitest'
import { AssetType, ImageSize, KeyType } from '../src/types'
import type { Asset } from '../src/types'
import { getFilename } from '../src/gallery/filename'

/*
getFilename reads `ipp.downloadedFilename` via getConfigOption; mock the
config-access module so tests exercise the default (original filename) mode
without loading a real config file.
*/
vi.mock('../src/config/access', () => ({
  getConfigOption: (_path: string, fallback?: unknown) => fallback
}))

function videoAsset (originalFileName: string, originalMimeType = 'video/x-msvideo'): Asset {
  return {
    id: 'asset-id',
    key: 'k',
    keyType: KeyType.key,
    type: AssetType.video,
    isTrashed: false,
    originalFileName,
    originalMimeType
  }
}

function imageAsset (originalFileName: string, originalMimeType = 'image/heic'): Asset {
  return {
    id: 'asset-id',
    key: 'k',
    keyType: KeyType.key,
    type: AssetType.image,
    isTrashed: false,
    originalFileName,
    originalMimeType
  }
}

describe('getFilename servedMime override (playback-fallback downloads)', () => {
  it('swaps the extension to match the transcoded bytes', () => {
    expect(getFilename(videoAsset('clip.avi'), ImageSize.original, 'video/mp4')).toBe('clip.mp4')
    expect(getFilename(videoAsset('holiday.MOV', 'video/quicktime'), ImageSize.original, 'video/mp4')).toBe('holiday.mp4')
  })

  it('keeps the name unchanged when the served mime matches the original', () => {
    expect(getFilename(videoAsset('clip.mp4', 'video/mp4'), ImageSize.original, 'video/mp4')).toBe('clip.mp4')
  })

  it('ignores an unrecognised content-type instead of stripping the extension', () => {
    expect(getFilename(videoAsset('clip.avi'), ImageSize.original, 'application/octet-stream')).toBe('clip.avi')
    expect(getFilename(videoAsset('clip.avi'), ImageSize.original, undefined)).toBe('clip.avi')
  })

  it('does not affect ordinary original downloads', () => {
    expect(getFilename(videoAsset('clip.avi'), ImageSize.original)).toBe('clip.avi')
  })
})

describe('getFilename converted-byte previews (e.g. WebP preview generation)', () => {
  it('swaps the extension to match the served preview bytes', () => {
    expect(getFilename(imageAsset('holiday.heic'), ImageSize.preview, 'image/webp')).toBe('holiday.webp')
  })

  it('keeps a JPEG extension when the preview is JPEG', () => {
    expect(getFilename(imageAsset('holiday.heic'), ImageSize.preview, 'image/jpeg')).toBe('holiday.jpg')
  })

  it('falls back to the hardcoded tier mime without an override', () => {
    expect(getFilename(imageAsset('holiday.heic'), ImageSize.preview)).toBe('holiday.jpg')
  })
})
