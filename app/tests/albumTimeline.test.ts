import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getShareByKey } from '../src/immich'
import { KeyType } from '../src/types'

// 3.0-shaped responses: album `/shared-links/me` returns an empty assets[],
// and the album's assets are enumerated from the timeline API. This exercises
// the regression fix end-to-end through getShareByKey -> fetchShareByKey.

interface MockResponse {
  ok: boolean
  status: number
  headers: { get: (h: string) => string | null }
  json: () => Promise<unknown>
}

function jsonResponse (body: unknown, status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body
  }
}

const ALBUM_ID = '0aab733a-3cb4-416f-b4b9-f94906533aaa'

const sharedLinkResponse = (order?: string) => ({
  type: 'ALBUM',
  assets: [],
  allowDownload: true,
  expiresAt: null,
  showMetadata: true,
  key: 'real-key',
  album: {
    id: ALBUM_ID,
    albumName: 'Test album',
    albumThumbnailAssetId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    order
  }
})

const bucketsResponse = [{ timeBucket: '2026-06-01', count: 3 }]

// Columnar (struct-of-arrays). Index 1 is trashed and must be filtered out.
const bucketResponse = {
  id: [
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ],
  isImage: [true, true, false],
  ratio: [1.5, 0.5, 1],
  thumbhash: ['hashA', null, 'hashC'],
  isTrashed: [false, true, false],
  fileCreatedAt: ['2026-06-03T00:00:00.000Z', '2026-06-02T00:00:00.000Z', '2026-06-01T00:00:00.000Z']
}

function routeFetch (sharedLink: unknown) {
  return vi.fn(async (url: string) => {
    if (url.includes('/shared-links/me')) return jsonResponse(sharedLink)
    if (url.includes('/timeline/buckets')) return jsonResponse(bucketsResponse)
    if (url.includes('/timeline/bucket')) return jsonResponse(bucketResponse)
    throw new Error('Unexpected fetch to ' + url)
  })
}

let keyCounter = 0
function uniqueKey () {
  // getShareByKey caches by key; a fresh key per test avoids cross-test reuse.
  return 'album-key-' + (keyCounter++)
}

describe('album timeline enumeration (Immich 3.0)', () => {
  beforeEach(() => {
    process.env.IMMICH_URL = 'http://immich.test'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('populates grid assets from the timeline and filters trashed', async () => {
    vi.stubGlobal('fetch', routeFetch(sharedLinkResponse()))
    const result = await getShareByKey(uniqueKey(), undefined, KeyType.key)

    expect(result.valid).toBe(true)
    const assets = result.link!.assets
    // 3 assets, 1 trashed -> 2 survive
    expect(assets.map(a => a.id)).toEqual([
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'cccccccc-cccc-cccc-cccc-cccccccccccc'
    ])
    // grid assets are flagged for lazy detail loading
    expect(assets.every(a => a.needsDetail)).toBe(true)
    // type derived from isImage
    expect(assets[0].type).toBe('IMAGE')
    expect(assets[1].type).toBe('VIDEO')
    // thumbhash carried through; null becomes undefined
    expect(assets[0].thumbhash).toBe('hashA')
    // dimensions derived from ratio (landscape 1.5 -> wider than tall)
    expect(assets[0].width!).toBeGreaterThan(assets[0].height!)
  })

  it('stamps the share key/keyType onto every asset', async () => {
    vi.stubGlobal('fetch', routeFetch(sharedLinkResponse()))
    const key = uniqueKey()
    const result = await getShareByKey(key, undefined, KeyType.key)
    expect(result.link!.assets.every(a => a.key === key && a.keyType === KeyType.key)).toBe(true)
  })

  it('respects album sort order asc', async () => {
    vi.stubGlobal('fetch', routeFetch(sharedLinkResponse('asc')))
    const result = await getShareByKey(uniqueKey(), undefined, KeyType.key)
    const dates = result.link!.assets.map(a => a.fileCreatedAt)
    expect(dates).toEqual([...dates].sort())
  })

  it('respects album sort order desc', async () => {
    vi.stubGlobal('fetch', routeFetch(sharedLinkResponse('desc')))
    const result = await getShareByKey(uniqueKey(), undefined, KeyType.key)
    const dates = result.link!.assets.map(a => a.fileCreatedAt)
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('keeps the album cover id from /shared-links/me (no extra album fetch)', async () => {
    vi.stubGlobal('fetch', routeFetch(sharedLinkResponse()))
    const result = await getShareByKey(uniqueKey(), undefined, KeyType.key)
    expect(result.link!.album!.albumThumbnailAssetId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  })

  it('is invalid when the album share has no album id', async () => {
    const noId = { ...sharedLinkResponse(), album: undefined }
    vi.stubGlobal('fetch', routeFetch(noId))
    const result = await getShareByKey(uniqueKey(), undefined, KeyType.key)
    expect(result.valid).toBe(false)
  })

  it('is invalid (not cached empty) when timeline enumeration fails upstream', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/shared-links/me')) return jsonResponse(sharedLinkResponse())
      if (url.includes('/timeline/buckets')) return jsonResponse({ message: 'boom' }, 500)
      throw new Error('Unexpected fetch to ' + url)
    }))
    const result = await getShareByKey(uniqueKey(), undefined, KeyType.key)
    expect(result.valid).toBe(false)
  })
})
