import { pipeline, PassThrough, Readable } from 'stream'
import crypto from 'crypto'
import { Request, Response } from 'express-serve-static-core'
import { KeyType, log, respondToInvalidRequest, SharedLink } from '@ipp/core'
import { ForwardResult, forwardUpload } from './forward'
import { Admit, Admitted, BODY_IDLE_MS, BODY_MIN_BYTES_PER_INTERVAL, declaredLength, finishUpload, incomingUpload, refuse } from './receive'
import { createIdleTimeoutStream } from './idleTimeoutStream'

/*
  A file larger than `ipp.upload.chunkSize` is sent in chunks, for a reverse
  proxy or CDN that caps each request body (Cloudflare refuses any over
  100 MB). Immich has no resumable upload, so `start` opens the usual single
  `POST /assets` with a pipe as its body, and each chunk streams into that
  pipe as it arrives. The offset counts bytes written, so a chunk cut off
  partway is continued from where it stopped, and nothing is buffered.

  The uploads in progress are the service's only state, held in memory and
  lost on a restart. An upload no chunk arrives for in time is cancelled,
  its request to Immich aborted and its byte budget given back.
*/

/*
  Behind a CDN that buffers each request, the service sees nothing while a
  chunk is on its way, so an upload is given as long as one chunk takes at
  0.5 Mbit/s, and never less than 5 minutes.
*/
const CHUNK_MIN_BYTES_PER_SECOND = 62_500
const CHUNK_MIN_IDLE_MS = 5 * 60_000

const ID_PATTERN = /^[0-9a-f]{32}$/

interface ChunkedUpload {
  admitted: Admitted
  shareKey: string
  /** Bytes written to Immich so far. */
  offset: number
  body: PassThrough
  controller: AbortController
  result: Promise<ForwardResult>
  /** Immich's answer as soon as it arrives; before the last chunk, a failure. */
  answer?: ForwardResult
  /** The answer once given to the visitor; kept so a retried last chunk gets it too. */
  settled?: ForwardResult
  /** The chunk streaming in now; only it may write. */
  writer?: Readable
  timer?: NodeJS.Timeout
}

export type ChunkOutcome =
  | { kind: 'accepted', offset: number }
  | { kind: 'conflict', offset: number }
  | { kind: 'refused', status: number, reason: string }
  | { kind: 'finished', admitted: Admitted, result: ForwardResult, repeat: boolean }
  | { kind: 'gone' }

export interface ChunkedUploads {
  start: (admitted: Admitted, shareKey: string) => string
  receive: (id: string, shareKey: string, offset: number, length: number, chunk: Readable) => Promise<ChunkOutcome>
  cancel: (id: string, shareKey: string) => boolean
}

export function createChunkedUploads (opts: { chunkSize: number, idleMs?: number, forward?: typeof forwardUpload }): ChunkedUploads {
  const idleMs = opts.idleMs ?? Math.max(CHUNK_MIN_IDLE_MS, opts.chunkSize / CHUNK_MIN_BYTES_PER_SECOND * 1000)
  const forward = opts.forward ?? forwardUpload
  const uploads = new Map<string, ChunkedUpload>()

  function remove (id: string, upload: ChunkedUpload) {
    clearTimeout(upload.timer)
    if (uploads.get(id) === upload) uploads.delete(id)
  }

  function abort (id: string, upload: ChunkedUpload) {
    remove(id, upload)
    upload.writer?.destroy()
    upload.controller.abort()
    upload.body.destroy()
    upload.admitted.release()
  }

  /** Expire an upload that has gone quiet, or a finished one whose answer has had time to be fetched. */
  function arm (id: string, upload: ChunkedUpload) {
    clearTimeout(upload.timer)
    upload.timer = setTimeout(() => {
      if (upload.settled) {
        remove(id, upload)
        return
      }
      log('Dropped upload ' + upload.admitted.filename + ': no chunk received in ' + Math.round(idleMs / 1000) + ' s')
      abort(id, upload)
    }, idleMs)
  }

  function finished (id: string, upload: ChunkedUpload, result: ForwardResult): ChunkOutcome {
    upload.settled = result
    upload.body.destroy()
    arm(id, upload)
    return { kind: 'finished', admitted: upload.admitted, result, repeat: false }
  }

  return {
    start (admitted, shareKey) {
      const id = crypto.randomBytes(16).toString('hex')
      const body = new PassThrough()
      const controller = new AbortController()
      const upload: ChunkedUpload = {
        admitted,
        shareKey,
        offset: 0,
        body,
        controller,
        result: forward(admitted.permit, incomingUpload(admitted, body), controller.signal)
      }
      upload.result.then(answer => { upload.answer = answer })
      uploads.set(id, upload)
      arm(id, upload)
      return id
    },

    async receive (id, shareKey, offset, length, chunk) {
      const upload = ID_PATTERN.test(id) ? uploads.get(id) : undefined
      if (!upload || upload.shareKey !== shareKey) return { kind: 'gone' }
      if (upload.settled) return { kind: 'finished', admitted: upload.admitted, result: upload.settled, repeat: true }
      if (upload.answer) return finished(id, upload, upload.answer)
      // Every byte is in, and Immich has yet to answer
      if (upload.offset === upload.admitted.size) return { kind: 'finished', admitted: upload.admitted, result: await upload.result, repeat: true }
      // A chunk still streaming here is one the visitor has given up on; the newer request takes over
      if (upload.writer) {
        upload.writer.destroy()
        upload.writer = undefined
        arm(id, upload)
      }
      if (offset > upload.offset) return { kind: 'conflict', offset: upload.offset }
      if (length === 0 || length > opts.chunkSize || offset + length > upload.admitted.size) {
        return { kind: 'refused', status: 400, reason: 'The chunk does not fit the file' }
      }

      upload.writer = chunk
      clearTimeout(upload.timer)
      /*
        A chunk sent again after a dropped connection starts at or before the
        offset. Its bytes already written are skipped rather than refused: a
        refusal sent before the body is read often reaches a browser as a
        network error, and the visitor would never learn the offset.
      */
      let skip = upload.offset - offset
      try {
        for await (const part of chunk) {
          if (upload.writer !== chunk) break
          const fresh = part.subarray(Math.max(0, skip))
          skip -= part.length
          if (!fresh.length) continue
          const drained = upload.body.write(fresh)
          upload.offset += fresh.length
          if (!drained) await Promise.race([new Promise(resolve => upload.body.once('drain', resolve)), upload.result])
          if (upload.answer) break
        }
      } catch {
        // The chunk was cut off; what was written stays written
      }
      if (upload.writer !== chunk) return { kind: 'conflict', offset: upload.offset }
      upload.writer = undefined
      if (uploads.get(id) !== upload) return { kind: 'gone' }
      if (upload.answer) return finished(id, upload, upload.answer)
      if (upload.offset === upload.admitted.size) {
        upload.body.end()
        const result = await upload.result
        return uploads.get(id) === upload ? finished(id, upload, result) : { kind: 'gone' }
      }
      arm(id, upload)
      return upload.offset >= offset + length ? { kind: 'accepted', offset: upload.offset } : { kind: 'conflict', offset: upload.offset }
    },

    cancel (id, shareKey) {
      const upload = uploads.get(id)
      if (!upload || upload.shareKey !== shareKey) return false
      if (!upload.settled) abort(id, upload)
      return true
    }
  }
}

function respond (res: Response, outcome: ChunkOutcome): void {
  switch (outcome.kind) {
    case 'accepted':
      res.json({ offset: outcome.offset })
      return
    case 'conflict':
      res.status(409).json({ offset: outcome.offset })
      return
    case 'refused':
      refuse(res, outcome.status, outcome.reason)
      return
    case 'gone':
      respondToInvalidRequest(res, 404, 'Unknown upload')
      return
    case 'finished':
      if (!outcome.repeat) {
        finishUpload(res, outcome.admitted, outcome.result)
      } else if (outcome.result.ok) {
        res.json({ status: outcome.result.status })
      } else {
        refuse(res, outcome.result.status, outcome.result.reason)
      }
  }
}

/** Build the handlers for `POST <share>/upload/start`, `PUT <share>/upload/<id>` and `DELETE <share>/upload/<id>`. */
export function createChunkedReceiver (admit: Admit, uploads: ChunkedUploads, chunkSize: number) {
  return {
    start (req: Request, res: Response, link: SharedLink, keyType: KeyType): void {
      const size = typeof req.query.size === 'string' ? req.query.size : undefined
      const admitted = admit(req, res, link, keyType, declaredLength(size))
      if (!admitted) return
      res.json({ id: uploads.start(admitted, req.params.key), chunkSize })
    },

    async chunk (req: Request, res: Response): Promise<void> {
      const offset = declaredLength(typeof req.query.offset === 'string' ? req.query.offset : undefined)
      const length = declaredLength(req.headers['content-length'])
      if (offset === undefined || length === undefined) {
        refuse(res, 400, 'The chunk has no offset or size')
        return
      }
      const chunk = pipeline(req, createIdleTimeoutStream(BODY_IDLE_MS, BODY_MIN_BYTES_PER_INTERVAL), () => {})
      respond(res, await uploads.receive(req.params.id, req.params.key, offset, length, chunk))
    },

    cancel (req: Request, res: Response): void {
      if (!uploads.cancel(req.params.id, req.params.key)) {
        respondToInvalidRequest(res, 404, 'Unknown upload')
        return
      }
      res.status(204).end()
    }
  }
}
