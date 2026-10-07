import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import type { Server } from 'http'
import type { AddressInfo } from 'net'
import { sessionMiddleware, unlockHandler } from '../src/session'

/*
  The unlock body is visitor input. Only a share-shaped key with a string
  password is stored; anything else is dropped before it reaches the cookie,
  so a stray object can never become `req.password` or a session key.
*/

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
