import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AssetType, KeyType } from '../src/types'
import type { Asset, SharedLink } from '../src/types'
import type { Response } from 'express-serve-static-core'
import { findMotionPhotoStill } from '../src/share'
import { gallery } from '../src/gallery/builder'

/*
  Motion photo (Live Photo) support. Two rules worth pinning down: the set of
  clip ids the video route will serve stays bounded by the share's own assets,
  and `motionUrl` reaches the client only for images that have a clip, and only
  while `ipp.motionPhotos` is on.

  The builder reads config through config/access, so mock that module and set
  options per test rather than loading a real config file.
*/
const cfg: Record<string, unknown> = {}
vi.mock('../src/config/access', () => ({
  getConfigOption: (path: string, fallback?: unknown) => (path in cfg ? cfg[path] : fallback),
  getNumericConfigOption: (path: string, fallback: number) => (path in cfg ? Number(cfg[path]) : fallback)
}))

const STILL_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const CLIP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const UNRELATED_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

function asset (overrides: Partial<Asset> = {}): Asset {
  return {
    id: STILL_ID,
    key: 'share-key',
    keyType: KeyType.key,
    type: AssetType.image,
    isTrashed: false,
    ...overrides
  }
}

function share (assets: Asset[]): SharedLink {
  return {
    key: 'share-key',
    keyType: KeyType.key,
    type: 'INDIVIDUAL',
    assets,
    expiresAt: null
  }
}

/** Render a gallery for these assets and return the items the client receives. */
async function renderItems (assets: Asset[]) {
  let html = ''
  const res = {
    req: { protocol: 'https', headers: { host: 'example.com' } },
    header: () => {},
    send: (body: string) => { html = body }
  } as unknown as Response
  await gallery(res, share(assets))
  const match = html.match(/<script type="application\/json" id="ipp-init">(.*?)<\/script>/s)
  if (!match) throw new Error('No init JSON block in the rendered gallery')
  return JSON.parse(match[1]).items as Array<Record<string, unknown>>
}

describe('motion photo clip resolution', () => {
  it('resolves the shared still that a clip id belongs to', () => {
    const link = share([asset({ livePhotoVideoId: CLIP_ID }), asset({ id: UNRELATED_ID })])
    expect(findMotionPhotoStill(link, CLIP_ID)?.id).toBe(STILL_ID)
  })

  it('does not resolve an id no shared asset points at', () => {
    const link = share([asset({ livePhotoVideoId: CLIP_ID })])
    expect(findMotionPhotoStill(link, UNRELATED_ID)).toBeUndefined()
  })

  it('does not match assets that have no clip', () => {
    // Guards the undefined === undefined case: an empty id must not resolve to
    // the first ordinary asset in the share.
    const link = share([asset(), asset({ id: UNRELATED_ID })])
    expect(findMotionPhotoStill(link, '')).toBeUndefined()
  })
})

describe('motionUrl in the gallery init JSON', () => {
  beforeEach(() => {
    for (const key of Object.keys(cfg)) delete cfg[key]
  })

  it('emits a clip playback URL for a motion photo only', async () => {
    const items = await renderItems([
      asset({ livePhotoVideoId: CLIP_ID }),
      asset({ id: UNRELATED_ID }),
      // A video can never be the still half of a motion photo; `needsDetail`
      // keeps the builder from probing Immich for its content-type.
      asset({ id: CLIP_ID, type: AssetType.video, livePhotoVideoId: CLIP_ID, needsDetail: true })
    ])
    expect(items[0].motionUrl).toBe('/share/video/share-key/' + CLIP_ID)
    expect(items[1]).not.toHaveProperty('motionUrl')
    expect(items[2]).not.toHaveProperty('motionUrl')
  })

  it('omits motionUrl when ipp.motionPhotos is off', async () => {
    cfg['ipp.motionPhotos'] = false
    const items = await renderItems([asset({ livePhotoVideoId: CLIP_ID })])
    expect(items[0]).not.toHaveProperty('motionUrl')
  })
})
