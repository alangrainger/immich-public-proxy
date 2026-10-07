import { describe, it, expect, vi } from 'vitest'
import { Asset, AssetType, AssetVisibility, KeyType } from '@ipp/core'
import { servableAssets } from '../src/share'

function asset (overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    key: 'k',
    keyType: KeyType.key,
    type: AssetType.image,
    isTrashed: false,
    thumbhash: 'abc',
    ...overrides
  }
}

describe('servableAssets', () => {
  it('keeps a processed, visible asset', () => {
    expect(servableAssets([asset()])).toHaveLength(1)
  })

  it('drops a locked asset even when Immich lists it', () => {
    expect(servableAssets([asset({ visibility: AssetVisibility.locked })])).toHaveLength(0)
  })

  it('keeps archived assets, which Immich shows in albums and shares', () => {
    expect(servableAssets([asset({ visibility: AssetVisibility.archive })])).toHaveLength(1)
  })

  it('keeps an asset with no visibility field, for Immich responses that omit it', () => {
    expect(servableAssets([asset({ visibility: undefined })])).toHaveLength(1)
  })

  it('drops trashed and unprocessed assets', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(servableAssets([asset({ isTrashed: true })])).toHaveLength(0)
    expect(servableAssets([asset({ id: 'a2', thumbhash: undefined })])).toHaveLength(0)
    vi.restoreAllMocks()
  })
})
