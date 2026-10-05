import { describe, it, expect } from 'vitest'
import { AlbumType } from '@ipp/core'
import { buildNotification } from '../src/notify'
import { share } from './helpers'

const file = { name: 'ipp_upload_IMG_0042.jpg', size: 3145728, type: 'image/jpeg' }
const asset = { id: 'bbbbbbbb-0000-0000-0000-000000000003', status: 'created' as const }

describe('buildNotification', () => {
  it('names an album share by its album id', () => {
    expect(buildNotification(share(), file, asset).data.share).toEqual({
      type: 'album',
      id: 'aaaaaaaa-0000-0000-0000-000000000002',
      title: 'Holiday 2025'
    })
  })

  it('names an individual share by the link id', () => {
    const payload = buildNotification(share({ type: AlbumType.individual, album: undefined, description: 'Some photos' }), file, asset)
    expect(payload.data.share).toEqual({
      type: 'individual',
      id: 'ffffffff-0000-0000-0000-000000000001',
      title: 'Some photos'
    })
  })

  it('carries a flat title and message for simple receivers', () => {
    const payload = buildNotification(share(), file, asset)
    expect(payload.title).toBe('Photo sent to Holiday 2025')
    expect(payload.message).toBe('ipp_upload_IMG_0042.jpg (3.0 MB) was uploaded to Holiday 2025.')
  })

  it('never carries the share key, slug or password', () => {
    const payload = JSON.stringify(buildNotification(share({ key: 'secret-key', slug: 'secret-slug', password: 'hunter2' }), file, asset))
    expect(payload).not.toContain('secret-key')
    expect(payload).not.toContain('secret-slug')
    expect(payload).not.toContain('hunter2')
  })
})
