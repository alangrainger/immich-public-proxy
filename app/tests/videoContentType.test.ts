import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getVideoContentType } from '../src/immich'
import { Asset, AssetType, KeyType } from '../src/types'

const video: Asset = {
  id: 'v1',
  key: 'testkey',
  keyType: KeyType.key,
  type: AssetType.video,
  isTrashed: false
}

describe('getVideoContentType', () => {
  beforeEach(() => {
    process.env.IMMICH_URL = 'http://immich.test'
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns the content-type and cancels the unread video body', async () => {
    let cancelled = false
    const body = new ReadableStream({
      pull (controller) { controller.enqueue(new Uint8Array(1024)) },
      cancel () { cancelled = true }
    })
    vi.stubGlobal('fetch', vi.fn(async () => new globalThis.Response(body, {
      status: 200,
      headers: { 'content-type': 'video/mp4' }
    })))
    expect(await getVideoContentType(video)).toBe('video/mp4')
    expect(cancelled).toBe(true)
  })

  it('returns undefined when Immich cannot serve the video #119', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new globalThis.Response('{"message":"Not found"}', { status: 404 })))
    expect(await getVideoContentType(video)).toBeUndefined()
  })

  it('returns undefined when Immich is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    expect(await getVideoContentType(video)).toBeUndefined()
  })
})
