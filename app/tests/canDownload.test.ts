import { describe, it, expect, beforeEach, vi } from 'vitest'
import { KeyType, loadConfig, SharedLink } from '@ipp/core'
import { canDownload } from '../src/share'

// canDownload gates the download UI on ipp.allowDownload: 0 off, 1 follow the
// Immich share's toggle, 2 always. Anything else fails closed.

function setConfig (config: unknown) {
  process.env.CONFIG = JSON.stringify(config)
  loadConfig()
}

const share = (allowDownload: boolean): SharedLink => ({
  key: 'k',
  keyType: KeyType.key,
  type: 'ALBUM',
  assets: [],
  allowDownload
})

describe('canDownload', () => {
  beforeEach(() => {
    delete process.env.CONFIG
    loadConfig()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('is off by default', () => {
    expect(canDownload(share(true))).toBe(false)
  })

  it('follows the Immich toggle with 1', () => {
    setConfig({ ipp: { allowDownload: 1 } })
    expect(canDownload(share(true))).toBe(true)
    expect(canDownload(share(false))).toBe(false)
  })

  it('is always on with 2', () => {
    setConfig({ ipp: { allowDownload: 2 } })
    expect(canDownload(share(false))).toBe(true)
  })

  it.each([true, '1', '2', 3, -1])('fails closed for %j', value => {
    setConfig({ ipp: { allowDownload: value } })
    expect(canDownload(share(true))).toBe(false)
  })
})
