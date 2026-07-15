import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getImmichVersion, isImmichVersionSupported, MIN_IMMICH_VERSION } from '../src/immich'

// The startup guard that refuses to run against an Immich server older than
// IPP supports. The floor is 2.0.0 - the columnar timeline API IPP relies on
// to enumerate album shares landed in Immich 2.0.

function jsonResponse (body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body)
  }
}

describe('isImmichVersionSupported', () => {
  it('accepts exactly the minimum version', () => {
    expect(isImmichVersionSupported(MIN_IMMICH_VERSION)).toBe(true)
  })

  it('accepts newer major/minor/patch across the 2.x and 3.x lines', () => {
    expect(isImmichVersionSupported({ major: 2, minor: 7, patch: 5 })).toBe(true)
    expect(isImmichVersionSupported({ major: 3, minor: 0, patch: 2 })).toBe(true)
    expect(isImmichVersionSupported({ major: 4, minor: 0, patch: 0 })).toBe(true)
  })

  it('rejects 1.x, which predates the columnar timeline API', () => {
    expect(isImmichVersionSupported({ major: 1, minor: 137, patch: 3 })).toBe(false)
    expect(isImmichVersionSupported({ major: 1, minor: 125, patch: 7 })).toBe(false)
  })
})

describe('getImmichVersion', () => {
  beforeEach(() => {
    process.env.IMMICH_URL = 'http://immich.test'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses the /server/version response', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/server/version')) return jsonResponse({ major: 3, minor: 0, patch: 2, prerelease: null })
      throw new Error('Unexpected fetch to ' + url)
    }))
    expect(await getImmichVersion()).toEqual({ major: 3, minor: 0, patch: 2 })
  })

  it('returns null when Immich is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    expect(await getImmichVersion()).toBeNull()
  })

  it('returns null on an unexpected response shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ version: 'v3.0.2' })))
    expect(await getImmichVersion()).toBeNull()
  })
})
