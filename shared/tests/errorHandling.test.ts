import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import express from 'express'
import type { Server } from 'http'
import type { AddressInfo } from 'net'
import { asyncHandler, errorHandler } from '../src/http'

/*
  Regression tests for the per-request crash class: under Express 4 a rejected
  promise in an async route became an unhandledRejection, and index.ts used to
  respond to that with process.exit(1) - one bad request took down the whole
  container. asyncHandler + errorHandler must instead turn any thrown/rejected
  route error into a plain 404 (the privacy policy: no upstream detail) while
  the server keeps serving.
*/

describe('asyncHandler + errorHandler', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    // Silence errorHandler's expected server-side logging during these tests
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const app = express()
    app.get('/ok', asyncHandler(async (_req, res) => { res.send('ok') }))
    app.get('/boom', asyncHandler(async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'headers')")
    }))
    app.get('/mid-stream', asyncHandler(async (_req, res) => {
      res.status(200)
      res.write('partial')
      throw new Error('upstream died mid-response')
    }))
    app.use(errorHandler)

    await new Promise<void>(resolve => {
      server = app.listen(0, resolve)
    })
    base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
  })

  afterAll(() => {
    server?.close()
    vi.restoreAllMocks()
  })

  it('turns a rejected route promise into a 404 with an empty body', async () => {
    const res = await fetch(base + '/boom')
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('')
  })

  it('keeps serving other requests after a route has thrown', async () => {
    await fetch(base + '/boom')
    const res = await fetch(base + '/ok')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('does not leak error detail to the client', async () => {
    const res = await fetch(base + '/boom')
    const body = await res.text()
    expect(body).not.toContain('TypeError')
    expect(body).not.toContain('headers')
  })

  it('ends the response when the error hits after headers were sent', async () => {
    const res = await fetch(base + '/mid-stream')
    // Status was already committed before the throw; the handler can only
    // end the stream, not rewrite it to a 404.
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('partial')
    // And the server is still alive afterwards
    const ok = await fetch(base + '/ok')
    expect(ok.status).toBe(200)
  })
})
