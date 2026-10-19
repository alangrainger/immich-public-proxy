import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { KeyType } from '@ipp/core'
import { getShareByKey } from '../src/immich'

/*
  `ipp.shareCacheTime` sets how long getShareByKey serves a share from memory
  before it asks Immich again. Config is mocked per test rather than loaded
  from a file.
*/
const cfg: Record<string, unknown> = {}
vi.mock('@ipp/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@ipp/core')>(),
  getNumericConfigOption: (path: string, fallback: number) => (path in cfg ? Number(cfg[path]) : fallback)
}))

const individualShare = {
  type: 'INDIVIDUAL',
  key: 'real-key',
  allowDownload: true,
  expiresAt: null,
  showMetadata: true,
  assets: [{ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', type: 'IMAGE', isTrashed: false, thumbhash: 'hashA' }]
}

function stubImmich () {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => individualShare
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

let keyCounter = 0
/** A fresh key per test, because getShareByKey caches by key. */
function uniqueKey () {
  return 'cache-key-' + (keyCounter++)
}

describe('ipp.shareCacheTime', () => {
  beforeEach(() => {
    process.env.IMMICH_URL = 'http://immich.test'
    vi.useFakeTimers()
    for (const key of Object.keys(cfg)) delete cfg[key]
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps a share for 120 seconds by default', async () => {
    const fetchMock = stubImmich()
    const key = uniqueKey()
    await getShareByKey(key, undefined, KeyType.key)
    vi.advanceTimersByTime(119_999)
    await getShareByKey(key, undefined, KeyType.key)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    await getShareByKey(key, undefined, KeyType.key)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uses the configured time', async () => {
    cfg['ipp.shareCacheTime'] = 15
    const fetchMock = stubImmich()
    const key = uniqueKey()
    await getShareByKey(key, undefined, KeyType.key)
    vi.advanceTimersByTime(14_999)
    await getShareByKey(key, undefined, KeyType.key)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    await getShareByKey(key, undefined, KeyType.key)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('treats a value under 1 as 1 second', async () => {
    cfg['ipp.shareCacheTime'] = 0
    const fetchMock = stubImmich()
    const key = uniqueKey()
    // Concurrent misses still share one Immich call
    await Promise.all([getShareByKey(key, undefined, KeyType.key), getShareByKey(key, undefined, KeyType.key)])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(999)
    await getShareByKey(key, undefined, KeyType.key)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    await getShareByKey(key, undefined, KeyType.key)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
