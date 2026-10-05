import { describe, it, expect, vi, afterEach } from 'vitest'
import { Asset, AssetType, KeyType, loadConfig } from '@ipp/core'
import { Writable } from 'stream'
import type { Request, Response } from 'express-serve-static-core'
import { assetBuffer } from '../src/stream/asset'
import { ImageSize, IncomingShareRequest } from '../src/types'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.CONFIG
  loadConfig()
})

function setConfig (config: unknown) {
  process.env.CONFIG = JSON.stringify(config)
  loadConfig()
}

const CHUNK = 64 * 1024

const asset: Asset = {
  id: 'a1',
  key: 'testkey',
  keyType: KeyType.key,
  type: AssetType.image,
  isTrashed: false,
  originalFileName: 'a1.jpg',
  originalMimeType: 'image/jpeg'
}

function makeRequest (method = 'GET'): IncomingShareRequest {
  return { req: { method } as Request, key: 'testkey', range: '' }
}

/*
Minimal stand-in for the Express response: a real Writable (so 'close',
writableFinished and destroy behave like the real thing) with a small
buffer and a sink that yields to the event loop on every chunk, like a
socket draining to a slow visitor.
*/
class FakeRes extends Writable {
  received = 0
  headers: Record<string, string> = {}

  constructor () {
    super({ highWaterMark: 16 * 1024 })
    // Node's http stack handles response stream errors internally; a bare
    // Writable would crash the test process on destroy(err) instead.
    this.on('error', () => { /* swallowed, like http.ServerResponse */ })
  }

  setHeader (name: string, value: string) { this.headers[name.toLowerCase()] = value; return this }
  status (_code: number) { return this }

  _write (chunk: Buffer, _enc: string, cb: (error?: Error | null) => void) {
    this.received += chunk.length
    setImmediate(cb)
  }
}

function asResponse (res: FakeRes): Response {
  return res as unknown as Response
}

type Source = {
  pulled: number
  cancelled: boolean
  signals: AbortSignal[]
}

/**
 * Fetch stub whose body is a pull-based stream: it hands out a chunk every
 * time the consumer asks and never ahead of that, so `pulled` measures how
 * far upstream has been read. Records cancellation and the request signal.
 * `totalBytes` Infinity streams forever until cancelled.
 */
function pullFetch (totalBytes: number, source: Source, headersDelayMs = 0) {
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal
    source.signals.push(signal)
    const abortError = () => new DOMException('This operation was aborted', 'AbortError')
    // Like real fetch: reject at once on an already-aborted signal, reject
    // during the header wait, and error the body stream after that.
    if (signal.aborted) throw abortError()
    if (headersDelayMs) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, headersDelayMs)
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(abortError())
        })
      })
    }
    const stream = new ReadableStream<Uint8Array>({
      start (controller) {
        signal.addEventListener('abort', () => {
          try { controller.error(abortError()) } catch { /* already closed */ }
        })
      },
      pull (controller) {
        if (source.pulled >= totalBytes) return controller.close()
        controller.enqueue(new Uint8Array(CHUNK))
        source.pulled += CHUNK
      },
      cancel () { source.cancelled = true }
    })
    return new globalThis.Response(stream, {
      status: 200,
      headers: { 'content-type': 'image/jpeg', 'content-length': String(totalBytes) }
    })
  })
}

function newSource (): Source {
  return { pulled: 0, cancelled: false, signals: [] }
}

describe('assetBuffer streaming', () => {
  it('delivers the whole body and forwards upstream headers', async () => {
    const source = newSource()
    vi.stubGlobal('fetch', pullFetch(4 * CHUNK, source))
    const res = new FakeRes()
    await assetBuffer(makeRequest(), asResponse(res), asset, ImageSize.original)
    expect(res.received).toBe(4 * CHUNK)
    expect(res.writableFinished).toBe(true)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.headers['content-length']).toBe(String(4 * CHUNK))
    expect(res.headers['content-disposition']).toContain('a1.jpg')
    expect(res.headers['x-accel-buffering']).toBe('no')
  })

  it('applies backpressure so upstream is read no faster than the visitor drains it', async () => {
    // Issue #288: a fast NAS read against a slow visitor used to buffer the
    // whole file in memory. Track how far ahead of the sink the source gets.
    const source = newSource()
    const total = 20 * 1024 * 1024
    vi.stubGlobal('fetch', pullFetch(total, source))
    const res = new FakeRes()
    let maxOutstanding = 0
    const origWrite = res._write.bind(res)
    res._write = (chunk, enc, cb) => {
      maxOutstanding = Math.max(maxOutstanding, source.pulled - res.received)
      origWrite(chunk, enc, cb)
    }
    await assetBuffer(makeRequest(), asResponse(res), asset, ImageSize.original)
    expect(res.received).toBe(total)
    expect(maxOutstanding).toBeLessThan(1024 * 1024)
  }, 20_000)

  it('cancels the upstream body when the visitor disconnects mid-stream', async () => {
    const source = newSource()
    vi.stubGlobal('fetch', pullFetch(Infinity, source))
    const res = new FakeRes()
    const origWrite = res._write.bind(res)
    let first = true
    res._write = (chunk, enc, cb) => {
      origWrite(chunk, enc, cb)
      if (first) {
        first = false
        setImmediate(() => res.destroy(new Error('client aborted')))
      }
    }
    await assetBuffer(makeRequest(), asResponse(res), asset, ImageSize.original)
    expect(source.cancelled || source.signals[0].aborted).toBe(true)
    // Upstream must stop shortly after the disconnect, not run to infinity
    expect(source.pulled).toBeLessThan(1024 * 1024)
  }, 10_000)

  it('aborts the fetch when the visitor disconnects before Immich has answered', async () => {
    const source = newSource()
    vi.stubGlobal('fetch', pullFetch(Infinity, source, 200))
    const res = new FakeRes()
    setTimeout(() => res.destroy(new Error('client aborted')), 20)
    await expect(assetBuffer(makeRequest(), asResponse(res), asset, ImageSize.original)).resolves.toBeUndefined()
    expect(source.signals[0].aborted).toBe(true)
    expect(source.pulled).toBe(0)
    expect(res.received).toBe(0)
  }, 10_000)

  it('does not fetch a body it will never write when the visitor left before we were called', async () => {
    const source = newSource()
    vi.stubGlobal('fetch', pullFetch(Infinity, source, 50))
    const res = new FakeRes()
    res.destroy()
    await assetBuffer(makeRequest(), asResponse(res), asset, ImageSize.original)
    expect(source.signals[0].aborted).toBe(true)
    expect(source.pulled).toBe(0)
  })

  it('answers HEAD with headers only and cancels the upstream body', async () => {
    const source = newSource()
    vi.stubGlobal('fetch', pullFetch(4 * CHUNK, source))
    const res = new FakeRes()
    await assetBuffer(makeRequest('HEAD'), asResponse(res), asset, ImageSize.original)
    expect(res.writableEnded).toBe(true)
    expect(res.received).toBe(0)
    expect(source.cancelled).toBe(true)
    expect(res.headers['content-length']).toBe(String(4 * CHUNK))
  })

  it('names a WebP preview download .webp', async () => {
    setConfig({ ipp: { maxDownloadQuality: 'preview' } })
    vi.stubGlobal('fetch', vi.fn(async () => new globalThis.Response(
      new ReadableStream({
        start (controller) { controller.enqueue(new Uint8Array(1024)); controller.close() }
      }),
      { status: 200, headers: { 'content-type': 'image/webp', 'content-length': '1024' } }
    )))
    const res = new FakeRes()
    await assetBuffer(makeRequest(), asResponse(res), asset, ImageSize.original)
    expect(res.headers['content-disposition']).toContain('a1.webp')
    expect(res.headers['content-type']).toBe('image/webp')
  })
})
