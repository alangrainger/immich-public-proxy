import { AlbumType, KeyType, loadConfig, SharedLink } from '@ipp/core'

/** Load `config` as if it came from the `CONFIG` env var. */
export function setConfig (config: Record<string, unknown>) {
  process.env.CONFIG = JSON.stringify(config)
  loadConfig()
}

export function resetConfig () {
  delete process.env.CONFIG
  loadConfig()
}

export function share (overrides: Partial<SharedLink> = {}): SharedLink {
  return {
    id: 'ffffffff-0000-0000-0000-000000000001',
    key: 'share-key',
    keyType: KeyType.key,
    type: AlbumType.album,
    assets: [],
    expiresAt: null,
    allowUpload: true,
    album: { id: 'aaaaaaaa-0000-0000-0000-000000000002', albumName: 'Holiday 2025' },
    ...overrides
  }
}
