import { Readable } from 'stream'
import crypto from 'crypto'
import { apiUrl, authHeaders, buildUrl, log, streamingRequestInit } from '@ipp/core'
import { UploadPermit, assertPermit } from './gate'

/**
 * Everything forwarded about one file, already validated by `receive.ts`.
 * `filename` is sanitised and carries an extension; `mimeType` is the bare
 * type with no parameters.
 */
export interface IncomingUpload {
  filename: string
  mimeType: string
  fileCreatedAt: string
  fileModifiedAt: string
  /** Raw file bytes, streamed straight through and never buffered. */
  body: Readable
  /** The declared `Content-Length`; the upload aborts past it. */
  maxBytes: number
}

export type ForwardResult =
  | { ok: true, status: 'created' | 'duplicate', id: string, bytes: number }
  | { ok: false, status: number, reason: string }

export const NOT_ACCEPTING_UPLOADS = 'This share does not accept uploads'

/** Thrown by the body generator when an upload runs past `maxBytes`. */
class UploadTooLargeError extends Error {}

/**
 * Serialise one multipart/form-data body for Immich's `POST /assets`. The
 * field set is fixed, so it is written by hand. The async generator pulls a
 * chunk only when the socket to Immich is ready for it.
 *
 * Only the two timestamps and the file are sent, so fields Immich would
 * otherwise honour (`visibility`, `livePhotoVideoId`, `metadata`,
 * `sidecarData`) cannot be set by a visitor. The filename rides on the
 * part's own Content-Disposition, which is where Immich reads it from.
 */
function multipartBody (boundary: string, upload: IncomingUpload, counter: { bytes: number }): Readable {
  const fields: Record<string, string> = {
    fileCreatedAt: upload.fileCreatedAt,
    fileModifiedAt: upload.fileModifiedAt
  }
  const part = (headers: string) => Buffer.from(`--${boundary}\r\n${headers}\r\n\r\n`)

  async function * generate () {
    for (const [name, value] of Object.entries(fields)) {
      yield part(`Content-Disposition: form-data; name="${name}"`)
      yield Buffer.from(value + '\r\n')
    }
    yield part(
      `Content-Disposition: form-data; name="assetData"; filename="${upload.filename}"\r\n` +
      `Content-Type: ${upload.mimeType}`
    )
    for await (const chunk of upload.body) {
      counter.bytes += chunk.length
      if (counter.bytes > upload.maxBytes) throw new UploadTooLargeError()
      yield chunk
    }
    yield Buffer.from(`\r\n--${boundary}--\r\n`)
  }

  return Readable.from(generate())
}

/**
 * Map Immich's answer to an upload onto the reply the visitor gets. 201 is a
 * new asset; 200 is a checksum match with an asset the owner already has,
 * which Immich still adds to the album or link. 400 is Immich refusing the
 * file itself. 401 and 403 mean the share no longer accepts uploads.
 */
export function replyForImmichStatus (status: number, body?: { id?: string, status?: string } | null): ForwardResult {
  if (status === 200 || status === 201) {
    return { ok: true, status: body?.status === 'duplicate' ? 'duplicate' : 'created', id: body?.id || '', bytes: 0 }
  }
  if (status === 400) return { ok: false, status: 400, reason: 'Immich would not accept this file' }
  if (status === 401 || status === 403) return { ok: false, status: 403, reason: NOT_ACCEPTING_UPLOADS }
  return { ok: false, status: 502, reason: 'Immich rejected the upload' }
}

/**
 * Send one upload to Immich as the share, and report what Immich made of it.
 * Authentication is the visitor's share key (plus the password token for a
 * password share); Immich files the asset into the album or the link itself.
 * Errors are returned, except a permit failure, which is a bug.
 */
export async function forwardUpload (permit: UploadPermit, upload: IncomingUpload, signal: AbortSignal): Promise<ForwardResult> {
  assertPermit(permit)

  const boundary = '----IPPUpload' + crypto.randomBytes(16).toString('hex')
  const counter = { bytes: 0 }
  const url = buildUrl(apiUrl() + '/assets', { [permit.keyType]: permit.key })

  let res: globalThis.Response
  try {
    res = await fetch(url, streamingRequestInit({
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        ...(await authHeaders(permit.keyType, permit.key, permit.password))
      },
      signal
    }, multipartBody(boundary, upload, counter)))
  } catch (e) {
    // The generator's throw surfaces here as the fetch rejecting
    if (causedBy(e, UploadTooLargeError)) return { ok: false, status: 413, reason: 'File is larger than declared' }
    if (signal.aborted) return { ok: false, status: 499, reason: 'Visitor cancelled the upload' }
    log.warn('Upload to Immich failed for ' + upload.filename + ': ' + errorText(e))
    return { ok: false, status: 502, reason: 'Could not reach Immich' }
  }

  const body = await res.json().catch(() => null) as { id?: string, status?: string, message?: string } | null
  const result = replyForImmichStatus(res.status, body)
  if (result.ok) return { ...result, bytes: counter.bytes }
  log.warn('Immich refused upload ' + upload.filename + ' with status ' + res.status +
    (body?.message ? ': ' + body.message : ''))
  return result
}

/** Walk the `cause` chain: fetch wraps the body generator's error. */
function causedBy (e: unknown, type: new () => Error): boolean {
  let current: unknown = e
  while (current instanceof Error) {
    if (current instanceof type) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

function errorText (e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
