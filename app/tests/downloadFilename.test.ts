import { describe, it, expect, vi, afterEach } from 'vitest'
import { AssetType, KeyType } from '@ipp/core'
import type { Asset, SharedLink } from '@ipp/core'
import { createHash } from 'crypto'
import { ImageSize } from '../src/types'
import { findPositionInShare, getFilename, positionInShare, positionStem } from '../src/gallery/filename'

/*
getFilename reads `ipp.downloadedFilename` via getConfigOption; mock it in
@ipp/core so tests pick the naming mode directly, without loading a real
config file. Tests start in mode 0 (original filename); the position-name
tests switch to 2.
*/
const mocked = vi.hoisted(() => ({ downloadedFilename: 0 as unknown }))
vi.mock('@ipp/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@ipp/core')>(),
  getConfigOption: (path: string, fallback?: unknown) =>
    path === 'ipp.downloadedFilename' ? mocked.downloadedFilename ?? fallback : fallback
}))

afterEach(() => { mocked.downloadedFilename = 0 })

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

describe('getFilename WebP previews', () => {
  it('swaps the extension to match the served preview bytes', () => {
    expect(getFilename(imageAsset('holiday.heic'), ImageSize.preview, 'image/webp')).toBe('holiday.webp')
  })

  it('matches the served MIME type case-insensitively', () => {
    expect(getFilename(imageAsset('holiday.heic'), ImageSize.preview, 'image/WebP')).toBe('holiday.webp')
  })

  it('keeps a JPEG extension when the preview is JPEG', () => {
    expect(getFilename(imageAsset('holiday.heic'), ImageSize.preview, 'image/jpeg')).toBe('holiday.jpg')
  })

  it('falls back to the hardcoded tier mime without an override', () => {
    expect(getFilename(imageAsset('holiday.heic'), ImageSize.preview)).toBe('holiday.jpg')
  })
})

/** A share of `count` images whose ids are `asset-1` .. `asset-N`. */
function shareOf (count: number, key = 'sharekey', keyType = KeyType.key): SharedLink {
  const assets: Asset[] = Array.from({ length: count }, (_, i) => ({ ...imageAsset(`IMG_${i + 1}.heic`), id: `asset-${i + 1}` }))
  return { key, keyType, slug: keyType === KeyType.slug ? 'my-album' : null, type: 'ALBUM', assets, expiresAt: null }
}

const HASH_OF_SHAREKEY = createHash('sha256').update('sharekey').digest('hex').slice(0, 8)

describe('getFilename position names (downloadedFilename: 2)', () => {
  it('names by share hash and position, with the served extension', () => {
    mocked.downloadedFilename = 2
    const share = shareOf(5)
    expect(getFilename(share.assets[0], ImageSize.original, undefined, positionInShare(share, 0))).toBe(`${HASH_OF_SHAREKEY}_001.heic`)
    expect(getFilename(share.assets[4], ImageSize.original, undefined, positionInShare(share, 4))).toBe(`${HASH_OF_SHAREKEY}_005.heic`)
  })

  it('never puts the share key itself in the name', () => {
    expect(HASH_OF_SHAREKEY).toMatch(/^[0-9a-f]{8}$/)
    expect(positionStem(positionInShare(shareOf(1), 0))).not.toContain('sharekey')
  })

  it('pads to the digits of the asset count, minimum three', () => {
    const stem = (count: number, index: number) => positionStem(positionInShare(shareOf(count), index)).split('_')[1]
    expect(stem(1, 0)).toBe('001')
    expect(stem(9, 8)).toBe('009')
    expect(stem(10, 9)).toBe('010')
    expect(stem(999, 998)).toBe('999')
    expect(stem(1000, 0)).toBe('0001')
    expect(stem(1000, 999)).toBe('1000')
  })

  it('gives the same prefix whether the share was opened by key or by slug', () => {
    const byKey = positionStem(positionInShare(shareOf(3, 'sharekey', KeyType.key), 1))
    const bySlug = positionStem(positionInShare(shareOf(3, 'sharekey', KeyType.slug), 1))
    expect(bySlug).toBe(byKey)
    expect(positionStem(positionInShare(shareOf(3, 'otherkey'), 1))).not.toBe(byKey)
  })

  it('is deterministic for an unchanged share', () => {
    const a = positionStem(positionInShare(shareOf(20), 7))
    const b = positionStem(positionInShare(shareOf(20), 7))
    expect(a).toBe(b)
  })

  it('finds an asset by id, and a motion photo clip by its still', () => {
    const share = shareOf(4)
    share.assets[2].livePhotoVideoId = 'clip-id'
    expect(findPositionInShare(share, 'asset-2')).toEqual({ shareKey: 'sharekey', position: 2, count: 4 })
    expect(findPositionInShare(share, 'clip-id')).toEqual({ shareKey: 'sharekey', position: 3, count: 4 })
    expect(findPositionInShare(share, 'not-shared')).toBeUndefined()
  })

  it('falls back to the asset id when there is no position', () => {
    mocked.downloadedFilename = 2
    expect(getFilename(imageAsset('holiday.heic', 'image/jpeg'))).toBe('asset-id.jpg')
  })

  it('is the mode used when the config omits downloadedFilename', () => {
    mocked.downloadedFilename = undefined
    const share = shareOf(1)
    expect(getFilename(share.assets[0], ImageSize.original, undefined, positionInShare(share, 0))).toBe(`${HASH_OF_SHAREKEY}_001.heic`)
  })

  it('follows the served bytes for the extension, as the other modes do', () => {
    mocked.downloadedFilename = 2
    const share = shareOf(2)
    const position = positionInShare(share, 1)
    expect(getFilename(share.assets[1], ImageSize.preview, undefined, position)).toBe(`${HASH_OF_SHAREKEY}_002.jpg`)
    expect(getFilename(share.assets[1], ImageSize.preview, 'image/webp', position)).toBe(`${HASH_OF_SHAREKEY}_002.webp`)
    expect(getFilename(share.assets[1], ImageSize.thumbnail, undefined, position)).toBe(`${HASH_OF_SHAREKEY}_002.webp`)
    expect(getFilename(videoAsset('clip.avi'), ImageSize.original, 'video/mp4', position)).toBe(`${HASH_OF_SHAREKEY}_002.mp4`)
    expect(getFilename(videoAsset('clip.avi'), ImageSize.original, undefined, position)).toBe(`${HASH_OF_SHAREKEY}_002.avi`)
  })

  it('leaves modes 0 and 1 unchanged', () => {
    const share = shareOf(2)
    const position = positionInShare(share, 0)
    mocked.downloadedFilename = 0
    expect(getFilename(share.assets[0], ImageSize.original, undefined, position)).toBe('IMG_1.heic')
    mocked.downloadedFilename = 1
    expect(getFilename(share.assets[0], ImageSize.original, undefined, position)).toBe('asset-1.heic')
  })
})
