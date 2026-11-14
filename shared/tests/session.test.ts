import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import express from 'express'
import type { Server } from 'http'
import type { AddressInfo } from 'net'
import { copyUnlock, decodeCookie, sessionMiddleware, unlockHandler } from '../src/session'

// The unlock body is visitor input: only a share-shaped key and a string password may reach the cookie

describe('unlockHandler', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    const app = express()
    app.use(sessionMiddleware({ name: 'test-session' }))
    app.use(express.json())
    app.post('/share/unlock', unlockHandler)
    await new Promise<void>(resolve => {
      server = app.listen(0, resolve)
    })
    base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
  })

  afterAll(() => server?.close())

  async function unlock (body: unknown): Promise<Response> {
    return fetch(base + '/share/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  }

  it('stores a share-shaped key with a string password', async () => {
    const res = await unlock({ key: 'abc-DEF_123', password: 'hunter2' })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('test-session=')
  })

  it('ignores a key that is not share-shaped', async () => {
    for (const key of ['../../etc', '__proto__', 'a b', '', 42, { k: 1 }]) {
      const res = await unlock({ key, password: 'hunter2' })
      expect(res.status).toBe(200)
      expect(res.headers.get('set-cookie')).toBeNull()
    }
  })

  it('ignores a password that is not a string', async () => {
    for (const password of [{ nested: true }, ['a'], 42, null, undefined]) {
      const res = await unlock({ key: 'abc', password })
      expect(res.status).toBe(200)
      expect(res.headers.get('set-cookie')).toBeNull()
    }
  })
})

// Asset URLs carry the share key, so a slug unlock is copied to it and must lock again with the slug

describe('copyUnlock', () => {
  const HOUR = 60 * 60 * 1000
  let server: Server
  let base: string
  let cookies: Record<string, string>

  beforeAll(async () => {
    const app = express()
    app.use(sessionMiddleware({ name: 'test-session' }))
    app.use(express.json())
    app.post('/share/unlock', unlockHandler)
    app.get('/s/:key', decodeCookie, (req, res) => {
      if (req.password) copyUnlock(req, req.params.key, 'share-key')
      res.send(req.password ?? '')
    })
    app.get('/share/:key', decodeCookie, (req, res) => {
      res.send(req.password ?? '')
    })
    await new Promise<void>(resolve => {
      server = app.listen(0, resolve)
    })
    base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
  })

  beforeEach(() => {
    cookies = {}
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(0)
  })

  afterEach(() => vi.useRealTimers())

  afterAll(() => server?.close())

  async function send (path: string, body?: unknown): Promise<string> {
    const res = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        Cookie: Object.entries(cookies).map(([k, v]) => k + '=' + v).join('; ')
      },
      body: body ? JSON.stringify(body) : undefined
    })
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(';')
      const i = pair.indexOf('=')
      cookies[pair.slice(0, i)] = pair.slice(i + 1)
    }
    return res.text()
  }

  async function unlockSlug () {
    await send('/share/unlock', { key: 'my-slug', password: 'hunter2' })
    return send('/s/my-slug')
  }

  it('gives the share key the slug unlock', async () => {
    expect(await unlockSlug()).toBe('hunter2')
    expect(await send('/share/share-key')).toBe('hunter2')
  })

  it('replaces an expired share key entry when the slug is unlocked again', async () => {
    await unlockSlug()
    vi.setSystemTime(2 * HOUR)
    expect(await send('/share/share-key')).toBe('')
    expect(await unlockSlug()).toBe('hunter2')
    expect(await send('/share/share-key')).toBe('hunter2')
  })

  it('expires the share key with the slug unlock, not with the last copy', async () => {
    await unlockSlug()
    vi.setSystemTime(0.98 * HOUR)
    expect(await send('/s/my-slug')).toBe('hunter2')
    vi.setSystemTime(1.5 * HOUR)
    expect(await send('/share/share-key')).toBe('')
  })
})
