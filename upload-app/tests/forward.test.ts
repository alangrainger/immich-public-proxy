import { describe, it, expect } from 'vitest'
import { NOT_ACCEPTING_UPLOADS, replyForImmichStatus } from '../src/forward'

describe('replyForImmichStatus', () => {
  it('reports a new asset and a duplicate as success', () => {
    expect(replyForImmichStatus(201, { id: 'a1', status: 'created' })).toMatchObject({ ok: true, status: 'created', id: 'a1' })
    expect(replyForImmichStatus(200, { id: 'a1', status: 'duplicate' })).toMatchObject({ ok: true, status: 'duplicate', id: 'a1' })
  })

  it('passes Immich refusing the file through as 400', () => {
    expect(replyForImmichStatus(400)).toMatchObject({ ok: false, status: 400 })
  })

  it('reads 401 and 403 as the share no longer accepting uploads', () => {
    expect(replyForImmichStatus(401)).toEqual({ ok: false, status: 403, reason: NOT_ACCEPTING_UPLOADS })
    expect(replyForImmichStatus(403)).toEqual({ ok: false, status: 403, reason: NOT_ACCEPTING_UPLOADS })
  })

  it('reports anything else as an upstream failure', () => {
    expect(replyForImmichStatus(500)).toMatchObject({ ok: false, status: 502 })
    expect(replyForImmichStatus(413)).toMatchObject({ ok: false, status: 502 })
  })
})
