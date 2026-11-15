import { describe, it, expect, vi, afterEach } from 'vitest'
import { PassThrough, Readable } from 'stream'
import { createChunkedReceiver, createChunkedUploads } from '../src/chunked'
import { ForwardResult, IncomingUpload } from '../src/forward'
import { UploadPermit } from '../src/gate'
import { Admit, Admitted } from '../src/receive'
import { share } from './helpers'

afterEach(() => {
  vi.useRealTimers()
})

const CREATED: ForwardResult = { ok: true, status: 'created', id: 'a1', bytes: 0 }

function admitted (size: number): Admitted {
  return {
    link: share(),
    permit: {} as UploadPermit,
    filename: 'ipp_upload_clip.mp4',
    uploader: '',
    mimeType: 'video/mp4',
    fileCreatedAt: '2026-01-01T00:00:00.000Z',
    fileModifiedAt: '2026-01-01T00:00:00.000Z',
    size,
    release: vi.fn()
  }
}

/** A stand-in for `forwardUpload` that drains the body, as the request to Immich would. */
function fakeForward (answer: () => ForwardResult = () => CREATED) {
  const received: Buffer[] = []
  const signals: AbortSignal[] = []
  const forward = async (_permit: UploadPermit, upload: IncomingUpload, signal: AbortSignal): Promise<ForwardResult> => {
    signals.push(signal)
    const parts: Buffer[] = []
    try {
      for await (const part of upload.body) parts.push(part)
    } catch { }
    if (signal.aborted) return { ok: false, status: 499, reason: 'Visitor cancelled the upload' }
    received.push(Buffer.concat(parts))
    return answer()
  }
  return { forward, received, signals }
}

const chunk = (data: Buffer) => Readable.from([data])
const tick = () => new Promise(resolve => setImmediate(resolve))
const file = Buffer.from('0123456789')

describe('createChunkedUploads', () => {
  it('streams the chunks, in order, into one request and returns its result on the last', async () => {
    const { forward, received } = fakeForward()
    const uploads = createChunkedUploads({ chunkSize: 4, forward })
    const upload = admitted(file.length)
    const id = uploads.start(upload, 'key')
    expect(await uploads.receive(id, 'key', 0, 4, chunk(file.subarray(0, 4)))).toEqual({ kind: 'accepted', offset: 4 })
    expect(await uploads.receive(id, 'key', 4, 4, chunk(file.subarray(4, 8)))).toEqual({ kind: 'accepted', offset: 8 })
    expect(await uploads.receive(id, 'key', 8, 2, chunk(file.subarray(8)))).toEqual({ kind: 'finished', admitted: upload, result: CREATED, repeat: false })
    expect(received).toEqual([file])
  })

  it('skips the bytes of a chunk already written, and answers a gap with the offset expected', async () => {
    const { forward, received } = fakeForward()
    const uploads = createChunkedUploads({ chunkSize: 4, forward })
    const id = uploads.start(admitted(file.length), 'key')
    await uploads.receive(id, 'key', 0, 4, chunk(file.subarray(0, 4)))
    expect(await uploads.receive(id, 'key', 0, 4, chunk(file.subarray(0, 4)))).toEqual({ kind: 'accepted', offset: 4 })
    expect(await uploads.receive(id, 'key', 8, 2, chunk(file.subarray(8)))).toEqual({ kind: 'conflict', offset: 4 })
    await uploads.receive(id, 'key', 4, 4, chunk(file.subarray(4, 8)))
    await uploads.receive(id, 'key', 8, 2, chunk(file.subarray(8)))
    expect(received).toEqual([file])
  })

  it('keeps the bytes of a chunk cut off partway, and writes only the rest when it is sent again', async () => {
    const { forward, received } = fakeForward()
    const uploads = createChunkedUploads({ chunkSize: 10, forward })
    const id = uploads.start(admitted(file.length), 'key')
    const cut = Readable.from((async function * () {
      yield file.subarray(0, 3)
      throw new Error('Connection lost')
    })())
    expect(await uploads.receive(id, 'key', 0, 10, cut)).toEqual({ kind: 'conflict', offset: 3 })
    expect(await uploads.receive(id, 'key', 0, 10, chunk(file))).toMatchObject({ kind: 'finished', result: CREATED })
    expect(received).toEqual([file])
  })

  it('lets a newer request take over from a chunk still streaming', async () => {
    const { forward, received } = fakeForward()
    const uploads = createChunkedUploads({ chunkSize: 10, forward })
    const id = uploads.start(admitted(file.length), 'key')
    const stale = new PassThrough()
    const staleOutcome = uploads.receive(id, 'key', 0, 10, stale)
    stale.write(file.subarray(0, 3))
    await tick()
    expect(await uploads.receive(id, 'key', 0, 10, chunk(file))).toMatchObject({ kind: 'finished', result: CREATED })
    expect(await staleOutcome).toMatchObject({ kind: 'conflict' })
    expect(received).toEqual([file])
  })

  it('knows an upload only by its id and the share key that started it', async () => {
    const uploads = createChunkedUploads({ chunkSize: 4, forward: fakeForward().forward })
    const id = uploads.start(admitted(file.length), 'key')
    expect(await uploads.receive(id, 'other-key', 0, 4, chunk(file))).toEqual({ kind: 'gone' })
    expect(await uploads.receive('0'.repeat(32), 'key', 0, 4, chunk(file))).toEqual({ kind: 'gone' })
    expect(await uploads.receive('not-an-id', 'key', 0, 4, chunk(file))).toEqual({ kind: 'gone' })
    expect(uploads.cancel(id, 'other-key')).toBe(false)
  })

  it('refuses a chunk that is empty, over the chunk size, or past the end of the file', async () => {
    const uploads = createChunkedUploads({ chunkSize: 4, forward: fakeForward().forward })
    const id = uploads.start(admitted(6), 'key')
    for (const length of [0, 5]) {
      expect(await uploads.receive(id, 'key', 0, length, chunk(Buffer.alloc(length)))).toMatchObject({ kind: 'refused', status: 400 })
    }
    await uploads.receive(id, 'key', 0, 4, chunk(file.subarray(0, 4)))
    expect(await uploads.receive(id, 'key', 4, 4, chunk(file.subarray(4, 8)))).toMatchObject({ kind: 'refused', status: 400 })
  })

  it('gives a retried last chunk the same answer, without finishing twice', async () => {
    const uploads = createChunkedUploads({ chunkSize: 10, forward: fakeForward().forward })
    const upload = admitted(file.length)
    const id = uploads.start(upload, 'key')
    await uploads.receive(id, 'key', 0, 10, chunk(file))
    const again = chunk(file)
    expect(await uploads.receive(id, 'key', 0, 10, again)).toEqual({ kind: 'finished', admitted: upload, result: CREATED, repeat: true })
    // Read before the answer, so the browser sees the answer rather than a closed connection
    expect(again.readableEnded).toBe(true)
  })

  it('returns Immich refusing the file on the last chunk', async () => {
    const refused: ForwardResult = { ok: false, status: 400, reason: 'Immich would not accept this file' }
    const uploads = createChunkedUploads({ chunkSize: 10, forward: fakeForward(() => refused).forward })
    const id = uploads.start(admitted(file.length), 'key')
    expect(await uploads.receive(id, 'key', 0, 10, chunk(file))).toMatchObject({ kind: 'finished', result: refused })
  })

  it('returns a request to Immich that failed before the last chunk, once', async () => {
    const failed: ForwardResult = { ok: false, status: 502, reason: 'Could not reach Immich' }
    const uploads = createChunkedUploads({ chunkSize: 4, forward: async () => failed })
    const id = uploads.start(admitted(file.length), 'key')
    await tick()
    expect(await uploads.receive(id, 'key', 0, 4, chunk(file.subarray(0, 4)))).toMatchObject({ kind: 'finished', result: failed, repeat: false })
    expect(await uploads.receive(id, 'key', 0, 4, chunk(file.subarray(0, 4)))).toMatchObject({ kind: 'finished', result: failed, repeat: true })
  })

  it('cancels an upload no chunk arrives for: aborts Immich, releases the budget, forgets the id', async () => {
    vi.useFakeTimers()
    const { forward, signals } = fakeForward()
    const uploads = createChunkedUploads({ chunkSize: 4, idleMs: 1000, forward })
    const upload = admitted(file.length)
    const id = uploads.start(upload, 'key')
    vi.advanceTimersByTime(1000)
    expect(signals[0].aborted).toBe(true)
    expect(upload.release).toHaveBeenCalled()
    expect(await uploads.receive(id, 'key', 0, 4, chunk(file))).toEqual({ kind: 'gone' })
  })

  it('cancels an upload whose chunk stalls before a chunk of new bytes arrives', async () => {
    vi.useFakeTimers()
    const { forward, signals } = fakeForward()
    const uploads = createChunkedUploads({ chunkSize: 4, idleMs: 1000, forward })
    const id = uploads.start(admitted(file.length), 'key')
    const stalled = new PassThrough()
    const outcome = uploads.receive(id, 'key', 0, 4, stalled)
    stalled.write(file.subarray(0, 3))
    await vi.advanceTimersByTimeAsync(999)
    expect(signals[0].aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(signals[0].aborted).toBe(true)
    expect(await outcome).toEqual({ kind: 'gone' })
  })

  it('does not restart the timer for a chunk sent again, or one replaced before it sends anything', async () => {
    vi.useFakeTimers()
    const { forward, signals } = fakeForward()
    const uploads = createChunkedUploads({ chunkSize: 4, idleMs: 1000, forward })
    const id = uploads.start(admitted(file.length), 'key')
    expect(await uploads.receive(id, 'key', 0, 4, chunk(file.subarray(0, 4)))).toEqual({ kind: 'accepted', offset: 4 })
    await vi.advanceTimersByTimeAsync(500)
    expect(await uploads.receive(id, 'key', 0, 4, chunk(file.subarray(0, 4)))).toEqual({ kind: 'accepted', offset: 4 })
    const empty = uploads.receive(id, 'key', 4, 4, new PassThrough())
    await vi.advanceTimersByTimeAsync(400)
    const replacement = uploads.receive(id, 'key', 4, 4, new PassThrough())
    expect(await empty).toEqual({ kind: 'conflict', offset: 4 })
    await vi.advanceTimersByTimeAsync(100)
    expect(signals[0].aborted).toBe(true)
    expect(await replacement).toEqual({ kind: 'gone' })
  })

  it('gives each chunk of new bytes another idle period', async () => {
    vi.useFakeTimers()
    const { forward, signals } = fakeForward()
    const uploads = createChunkedUploads({ chunkSize: 4, idleMs: 1000, forward })
    const id = uploads.start(admitted(file.length), 'key')
    await vi.advanceTimersByTimeAsync(900)
    await uploads.receive(id, 'key', 0, 4, chunk(file.subarray(0, 4)))
    await vi.advanceTimersByTimeAsync(900)
    await uploads.receive(id, 'key', 4, 4, chunk(file.subarray(4, 8)))
    await vi.advanceTimersByTimeAsync(999)
    expect(signals[0].aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(signals[0].aborted).toBe(true)
  })

  it('gives Immich one idle period to answer after the last byte', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    const silent = async (_permit: UploadPermit, upload: IncomingUpload, signal: AbortSignal): Promise<ForwardResult> => {
      signals.push(signal)
      upload.body.resume()
      return await new Promise(resolve => signal.addEventListener('abort', () => resolve({ ok: false, status: 499, reason: 'Aborted' })))
    }
    const upload = admitted(file.length)
    const uploads = createChunkedUploads({ chunkSize: 10, idleMs: 1000, forward: silent })
    const id = uploads.start(upload, 'key')
    const outcome = uploads.receive(id, 'key', 0, 10, chunk(file))
    await vi.advanceTimersByTimeAsync(999)
    expect(signals[0].aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(signals[0].aborted).toBe(true)
    expect(upload.release).toHaveBeenCalled()
    expect(await outcome).toEqual({ kind: 'gone' })
  })

  it('cancels an upload Immich has stopped reading', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    const stuck = async (_permit: UploadPermit, _upload: IncomingUpload, signal: AbortSignal): Promise<ForwardResult> => {
      signals.push(signal)
      return await new Promise(resolve => signal.addEventListener('abort', () => resolve({ ok: false, status: 499, reason: 'Aborted' })))
    }
    const size = 64 * 1024
    const uploads = createChunkedUploads({ chunkSize: size, idleMs: 1000, forward: stuck })
    const id = uploads.start(admitted(size * 2), 'key')
    const outcome = uploads.receive(id, 'key', 0, size, chunk(Buffer.alloc(size)))
    await vi.advanceTimersByTimeAsync(1000)
    expect(signals[0].aborted).toBe(true)
    expect(await outcome).toEqual({ kind: 'gone' })
  })

  it('gives an upload as long as one chunk takes at 0.5 Mbit/s, and at least 5 minutes', () => {
    vi.useFakeTimers()
    const MB = 1024 * 1024
    for (const [chunkSize, idleMs] of [[1 * MB, 5 * 60_000], [50 * MB, 50 * MB / 62.5]]) {
      const { forward, signals } = fakeForward()
      createChunkedUploads({ chunkSize, forward }).start(admitted(chunkSize * 2), 'key')
      vi.advanceTimersByTime(idleMs - 1)
      expect(signals[0].aborted).toBe(false)
      vi.advanceTimersByTime(1)
      expect(signals[0].aborted).toBe(true)
    }
  })

  it('cancels on request', async () => {
    const uploads = createChunkedUploads({ chunkSize: 4, forward: fakeForward().forward })
    const upload = admitted(file.length)
    const id = uploads.start(upload, 'key')
    expect(uploads.cancel(id, 'key')).toBe(true)
    expect(upload.release).toHaveBeenCalled()
    expect(await uploads.receive(id, 'key', 0, 4, chunk(file))).toEqual({ kind: 'gone' })
  })
})

describe('createChunkedReceiver', () => {
  /** A response that records the status and body sent. */
  function response () {
    const sent: { status?: number, body?: unknown } = {}
    const res = {
      status (code: number) { sent.status = code; return res },
      json (body: unknown) { sent.body = body; return res },
      set () { return res }
    }
    return { res, sent }
  }

  it('refuses to start a chunked upload for a file no larger than one chunk', () => {
    const admit = vi.fn<Admit>(() => admitted(4))
    const receiver = createChunkedReceiver(admit, createChunkedUploads({ chunkSize: 4, forward: fakeForward().forward }), 4)
    for (const size of ['1', '4']) {
      const { res, sent } = response()
      receiver.start({ query: { size }, params: { key: 'key' } } as never, res as never, share(), 'key' as never)
      expect(sent.status).toBe(400)
    }
    expect(admit).not.toHaveBeenCalled()
    const { res, sent } = response()
    receiver.start({ query: { size: '5' }, params: { key: 'key' } } as never, res as never, share(), 'key' as never)
    expect(admit).toHaveBeenCalledOnce()
    expect(sent.body).toMatchObject({ chunkSize: 4 })
  })

  it('refuses a start once 20 uploads to the share are open, and counts a finished one as closed', async () => {
    const admit = vi.fn<Admit>(() => admitted(file.length))
    const uploads = createChunkedUploads({ chunkSize: 10, forward: fakeForward().forward })
    const receiver = createChunkedReceiver(admit, uploads, 4)
    const start = () => {
      const { res, sent } = response()
      receiver.start({ query: { size: '10' }, params: { key: 'key' } } as never, res as never, share(), 'key' as never)
      return sent
    }
    const ids = Array.from({ length: 20 }, () => (start().body as { id: string }).id)
    const refused = start()
    expect(refused.status).toBe(429)
    expect(admit).toHaveBeenCalledTimes(20)
    expect(uploads.openFor('other')).toBe(0)
    await uploads.receive(ids[0], 'key', 0, 10, chunk(file))
    expect(start().status).toBeUndefined()
  })
})
