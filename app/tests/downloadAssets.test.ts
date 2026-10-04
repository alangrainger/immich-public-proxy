import { describe, it, expect, vi, afterEach } from 'vitest'
import { Writable } from 'stream'
import { once } from 'events'
import type { Response } from 'express-serve-static-core'
import { downloadAssets } from '../src/stream/download'
import { loadConfig } from '../src/config/loader'
import { Asset, AssetType, KeyType, SharedLink } from '../src/types'

/*
"Download all" streams each asset from Immich straight into the zip on the
wire - no disk staging, no buffering of whole files (issue #289). These tests
cover the shape of that pipeline: backpressure, one upstream body at a time,
and the three ways it can end early (visitor leaves, Immich refuses, body
dies mid-stream).
*/

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.CONFIG
  loadConfig()
})

function setConfig (config: unknown) {
  process.env.CONFIG = JSON.stringify(config)
  loadConfig()
}

function makeAsset (id: string): Asset {
  return {
    id,
    key: 'testkey',
    keyType: KeyType.key,
    type: AssetType.image,
    isTrashed: false,
    originalFileName: id + '.jpg',
    originalMimeType: 'image/jpeg'
  }
}

const share: SharedLink = {
  key: 'testkey',
  keyType: KeyType.key,
  type: 'ALBUM',
  description: 'Test album',
  assets: []
}

/*
Minimal stand-in for the Express response: a real Writable (so 'close',
writableFinished and destroy behave like the real thing) plus the header
and status helpers downloadAssets and respondToInvalidRequest call.
*/
class FakeRes extends Writable {
  received = 0
  chunks: Buffer[] = []
  statusCode = 200
  headers: Record<string, string> = {}
  /** Delay applied to every write, to simulate a slow visitor. */
  writeDelayMs = 0

  constructor () {
    super()
    // Node's http stack handles response stream errors internally; a bare
    // Writable would crash the test process on destroy(err) instead.
    this.on('error', () => { /* swallowed, like http.ServerResponse */ })
  }

  setHeader (name: string, value: string) { this.headers[name] = value; return this }
  status (code: number) { this.statusCode = code; return this }
  send () { this.end(); return this }

  _write (chunk: Buffer, _enc: string, cb: (error?: Error | null) => void) {
    this.received += chunk.length
    this.chunks.push(chunk)
    if (this.writeDelayMs > 0) setTimeout(cb, this.writeDelayMs)
    else cb()
  }

  get output () { return Buffer.concat(this.chunks) }
}

function asResponse (res: FakeRes): Response {
  return res as unknown as Response
}

/** Fetch stub that returns the full body immediately. */
function instantFetch (bytes: number) {
  return vi.fn(async () => new globalThis.Response(new Uint8Array(bytes), { status: 200 }))
}

/**
 * Fetch stub whose body sends one chunk then stays open forever, erroring
 * only when the passed-in signal aborts - like a real streaming download
 * that gets cancelled. Records each request's signal for assertions.
 */
function trickleFetch (signals: AbortSignal[]) {
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal
    signals.push(signal)
    const stream = new ReadableStream({
      start (controller) {
        controller.enqueue(new Uint8Array(1024))
        signal.addEventListener('abort', () => {
          try { controller.error(signal.reason ?? new Error('aborted')) } catch { /* already errored */ }
        })
      }
    })
    return new globalThis.Response(stream, { status: 200 })
  })
}

/**
 * Fetch stub with a pull-based body: chunks are only produced on demand, and
 * `pulled` counts how many bytes have been handed over so far.
 */
function pullFetch (totalBytes: number, chunkBytes: number, counter: { pulled: number }) {
  return vi.fn(async () => {
    let sent = 0
    const stream = new ReadableStream({
      pull (controller) {
        if (sent >= totalBytes) {
          controller.close()
          return
        }
        const size = Math.min(chunkBytes, totalBytes - sent)
        controller.enqueue(new Uint8Array(size))
        sent += size
        counter.pulled = sent
      }
    })
    return new globalThis.Response(stream, { status: 200 })
  })
}

/**
 * Parse the central directory of a zip buffer: one {name, size} per entry.
 * Just enough of the format to check the output is a real zip with the
 * expected entries; extractors read the central directory, so it's the part
 * that matters.
 */
function centralDirectory (zip: Buffer): Array<{ name: string, size: number }> {
  const entries: Array<{ name: string, size: number }> = []
  let offset = zip.indexOf('PK\x01\x02', 0, 'binary')
  while (offset !== -1) {
    const size = zip.readUInt32LE(offset + 24)
    const nameLength = zip.readUInt16LE(offset + 28)
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    entries.push({ name, size })
    offset = zip.indexOf('PK\x01\x02', offset + 46 + nameLength, 'binary')
  }
  return entries
}

function countOf (zip: Buffer, signature: string): number {
  let count = 0
  let offset = zip.indexOf(signature, 0, 'binary')
  while (offset !== -1) {
    count++
    offset = zip.indexOf(signature, offset + 1, 'binary')
  }
  return count
}

describe('downloadAssets', () => {
  it('streams a valid zip with one entry per asset', async () => {
    vi.stubGlobal('fetch', instantFetch(2048))
    const res = new FakeRes()
    await downloadAssets(asResponse(res), share, [makeAsset('a1'), makeAsset('a2')])
    expect(res.writableFinished).toBe(true)
    expect(res.headers['Content-Type']).toBe('application/zip')
    // A CDN must never store the zip; Cloudflare's cache fill aborts large
    // downloads partway through otherwise #94
    expect(res.headers['Cache-Control']).toBe('no-store')
    const zip = res.output
    expect(countOf(zip, 'PK\x03\x04')).toBe(2) // local file headers
    expect(countOf(zip, 'PK\x05\x06')).toBe(1) // end of central directory
    expect(centralDirectory(zip)).toEqual([
      { name: 'a1.jpg', size: 2048 },
      { name: 'a2.jpg', size: 2048 }
    ])
  })

  it('honours backpressure from a slow visitor instead of buffering the body', async () => {
    const total = 32 * 1024 * 1024
    const counter = { pulled: 0 }
    vi.stubGlobal('fetch', pullFetch(total, 64 * 1024, counter))
    const res = new FakeRes()
    res.writeDelayMs = 1
    let worstLead = 0
    const origWrite = res._write.bind(res)
    res._write = (chunk, enc, cb) => {
      worstLead = Math.max(worstLead, counter.pulled - res.received)
      origWrite(chunk, enc, cb)
    }
    await downloadAssets(asResponse(res), share, [makeAsset('a1')])
    if (!res.writableFinished) await once(res, 'finish')
    expect(counter.pulled).toBe(total)
    // The lead is bounded by the stream buffers between the fetch body and
    // the response: archiver and zip-stream each hold up to 1 MB per side,
    // so roughly 4 MB in total. Without backpressure it would approach the
    // whole 32 MB.
    expect(worstLead).toBeLessThan(8 * 1024 * 1024)
  }, 20_000)

  it('fetches one asset at a time and cancels the upstream fetch when the client aborts mid-body', async () => {
    const signals: AbortSignal[] = []
    const fetchMock = trickleFetch(signals)
    vi.stubGlobal('fetch', fetchMock)
    const res = new FakeRes()
    const done = downloadAssets(asResponse(res), share, [makeAsset('a1'), makeAsset('a2'), makeAsset('a3')])
    // Give the first body a moment to start; nothing else should be in flight
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    res.destroy(new Error('client aborted'))
    await done
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(signals.every(s => s.aborted)).toBe(true)
  }, 10_000)

  it('resolves when the client aborts while the zip is streaming', async () => {
    // Large enough that archiver can't flush everything into a destroyed
    // response; without disconnect handling finalize() would hang forever.
    vi.stubGlobal('fetch', instantFetch(5 * 1024 * 1024))
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
    await downloadAssets(asResponse(res), share, [makeAsset('a1'), makeAsset('a2')])
    expect(res.destroyed).toBe(true)
  }, 10_000)

  it('answers 404 (not a broken zip) when the first asset fails before anything is sent', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new globalThis.Response('nope', { status: 500 })))
    const res = new FakeRes()
    await downloadAssets(asResponse(res), share, [makeAsset('a1'), makeAsset('a2')])
    expect(res.statusCode).toBe(404)
    expect(res.destroyed).toBe(false)
    expect(res.writableEnded).toBe(true)
    expect(res.received).toBe(0)
    expect(res.headers['Content-Type']).toBeUndefined()
  }, 10_000)

  it('destroys the response when a later asset keeps failing', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++
      return calls === 1
        ? new globalThis.Response(new Uint8Array(2048), { status: 200 })
        : new globalThis.Response('nope', { status: 500 })
    }))
    const res = new FakeRes()
    await downloadAssets(asResponse(res), share, [makeAsset('a1'), makeAsset('a2')])
    expect(res.received).toBeGreaterThan(0)
    expect(res.destroyed).toBe(true)
    expect(res.writableFinished).toBe(false)
  }, 10_000)

  it('destroys the response and stops fetching when a body errors mid-stream', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const signals: AbortSignal[] = []
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal)
      const stream = new ReadableStream({
        start (controller) {
          controller.enqueue(new Uint8Array(1024))
          setTimeout(() => controller.error(new Error('upstream died')), 20)
        }
      })
      return new globalThis.Response(stream, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = new FakeRes()
    await downloadAssets(asResponse(res), share, [makeAsset('a1'), makeAsset('a2'), makeAsset('a3')])
    expect(res.destroyed).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(signals.every(s => s.aborted)).toBe(true)
  }, 10_000)

  it('names a WebP preview zip entry .webp', async () => {
    setConfig({ ipp: { maxDownloadQuality: 'preview' } })
    const fetchMock = vi.fn(async () => new globalThis.Response(new Uint8Array(2048), {
      status: 200,
      headers: { 'content-type': 'image/webp' }
    }))
    vi.stubGlobal('fetch', fetchMock)
    const res = new FakeRes()
    await downloadAssets(asResponse(res), share, [makeAsset('a1')])
    expect(String(fetchMock.mock.calls[0][0])).toContain('size=preview')
    expect(centralDirectory(res.output)).toEqual([{ name: 'a1.webp', size: 2048 }])
  })
})
