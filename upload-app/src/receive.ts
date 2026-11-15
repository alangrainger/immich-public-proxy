import { pipeline, Readable } from 'stream'
import { Request, Response } from 'express-serve-static-core'
import dayjs from 'dayjs'
import { abortOnClose, KeyType, log, respondToInvalidRequest, SharedLink } from '@ipp/core'
import { askName, byteBudget, fieldSeparator, filenamePrefix, maxFileSize, rateLimit } from './config'
import { uploaderSlug, uploadFilename } from './filename'
import { ForwardResult, forwardUpload, IncomingUpload } from './forward'
import { authoriseUpload, UploadPermit } from './gate'
import { createIdleTimeoutStream, IdleTimeoutError } from './idleTimeoutStream'
import { createWindowBudget } from './limits'
import { buildNotification, sendNotification } from './notify'
import { formatSize, isUploadableName, isUploadableType } from './shared/upload'

/*
  The visitor-facing half of the upload path: validate one request, then
  hand it to `forward.ts` with a permit from `gate.ts`.

  Each file is its own POST whose body is the raw bytes, with the name and
  timestamps in the query string. The app re-encodes for Immich anyway, so
  it runs no multipart parser on visitor input, and nothing is buffered or
  written to disk.
*/

/*
  A body that delivers less than this in any one-minute interval is dropped.
  The floor is far below any phone uplink (8 KB/s is 64 kbit/s), yet it means
  a connection that trickles bytes to keep its byte-budget reservation alive
  has to keep spending real bandwidth to do so.
*/
export const BODY_IDLE_MS = 60_000
export const BODY_MIN_BYTES_PER_INTERVAL = 8 * 1024 * BODY_IDLE_MS / 1000

/**
 * Answer an upload the server will not take, in the shape the page reads.
 * The connection closes after it (see `index.ts`), so a body still in flight
 * stops costing its full bandwidth.
 */
export function refuse (res: Response, status: number, reason: string): void {
  res.status(status).json({ error: reason })
}

/** The declared `Content-Length`, or undefined when absent or malformed. */
export function declaredLength (header: string | undefined): number | undefined {
  return header && /^\d+$/.test(header) ? Number(header) : undefined
}

/**
 * Parse a visitor-supplied timestamp, falling back to now. Only a starting
 * point: Immich replaces it from EXIF when the file carries a better date.
 */
export function uploadTimestamp (raw: unknown): string {
  const parsed = typeof raw === 'string' && raw ? dayjs(raw) : undefined
  return (parsed?.isValid() ? parsed : dayjs()).toISOString()
}

/** An upload that passed every check, with its share of the byte budget reserved. */
export interface Admitted {
  link: SharedLink
  permit: UploadPermit
  filename: string
  uploader: string
  mimeType: string
  fileCreatedAt: string
  fileModifiedAt: string
  size: number
  /** Give the reserved bytes back; for an upload that did not store a file. */
  release: () => void
}

export type Admit = (req: Request, res: Response, link: SharedLink, keyType: KeyType, length: number | undefined) => Admitted | undefined

/**
 * Build the checks every upload passes before it is sent on, with the rate
 * limit and byte budget read from config. Called once, after the config has
 * loaded, and shared by both ways of sending a file so one budget covers them.
 *
 * Once the share has passed the gate, failures a visitor can act on answer
 * with a status and a short JSON reason rather than the 404 policy. A refused
 * upload has been answered when this returns undefined.
 */
export function createUploadAdmission (): Admit {
  // Keyed on address and share; behind a reverse proxy every visitor has the proxy's address
  const rate = createWindowBudget({ limit: rateLimit(), windowMs: 60_000 })
  const budget = createWindowBudget({ limit: byteBudget(), windowMs: 60 * 60_000 })
  const maxBytes = maxFileSize()
  const prefix = filenamePrefix()
  const withName = askName()
  const separator = fieldSeparator()

  return function admit (req, res, link, keyType, length) {
    const key = req.params.key
    const permit = authoriseUpload(link, key, keyType, req.password)
    if (!permit) {
      respondToInvalidRequest(res, 404, 'Share does not accept uploads')
      return
    }
    const shareId = link.id || key

    if (length === undefined) {
      refuse(res, 411, 'The upload has no Content-Length')
      return
    }
    if (length === 0) {
      refuse(res, 400, 'The file is empty')
      return
    }
    if (length > maxBytes) {
      refuse(res, 413, 'Larger than the ' + formatSize(maxBytes) + ' limit')
      return
    }

    // The name is the visitor's claim, kept only as part of the filename
    const uploader = withName ? uploaderSlug(req.query.uploader) : ''
    const filename = uploadFilename(req.query.filename, prefix, uploader, separator)
    if (!filename) {
      refuse(res, 400, 'Missing or unusable filename')
      return
    }

    const mimeType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
    if (!isUploadableType(mimeType) || !isUploadableName(filename)) {
      refuse(res, 415, 'Only photos and videos can be sent')
      return
    }

    // Charged only once the request is one the service would take, so a
    // stream of malformed requests cannot use up everyone's allowance
    const rated = rate(req.ip + ':' + shareId)
    if (!rated.ok) {
      res.set('Retry-After', String(rated.retryAfterSeconds))
      refuse(res, 429, 'Too many uploads. Wait a moment and try again.')
      return
    }

    // Reserved before streaming, so parallel uploads cannot overshoot the budget together
    const reserved = budget(shareId, length)
    if (!reserved.ok) {
      res.set('Retry-After', String(reserved.retryAfterSeconds))
      refuse(res, 413, 'This share has received its limit for the hour. Try again later.')
      return
    }

    return {
      link,
      permit,
      filename,
      uploader,
      mimeType,
      fileCreatedAt: uploadTimestamp(req.query.fileCreatedAt),
      fileModifiedAt: uploadTimestamp(req.query.fileModifiedAt),
      size: length,
      release: reserved.release
    }
  }
}

/** What `forward.ts` is told about an admitted upload whose bytes come from `body`. */
export function incomingUpload (admitted: Admitted, body: Readable): IncomingUpload {
  const { filename, mimeType, fileCreatedAt, fileModifiedAt, size } = admitted
  return { filename, mimeType, fileCreatedAt, fileModifiedAt, body, maxBytes: size }
}

/** Answer the visitor with Immich's result, and notify the owner of a stored file. */
export function finishUpload (res: Response, admitted: Admitted, result: ForwardResult): void {
  if (!result.ok) {
    admitted.release()
    // The visitor hung up; there is nobody left to answer
    if (result.status === 499) return
    refuse(res, result.status, result.reason)
    return
  }

  const { link, filename, mimeType, uploader } = admitted
  log('Received upload ' + filename + ' for share ' + (link.slug || link.id) + ' (Immich result: ' + result.status + ')')
  res.json({ status: result.status })

  // After the reply, so a slow webhook never holds up the visitor
  sendNotification(buildNotification(
    link,
    { name: filename, size: result.bytes, type: mimeType },
    { id: result.id, status: result.status },
    uploader
  ))
}

/** Build the handler for `POST <share>/upload`: one file as one request body. */
export function createUploadReceiver (admit: Admit) {
  return async function receiveUpload (req: Request, res: Response, link: SharedLink, keyType: KeyType): Promise<void> {
    const admitted = admit(req, res, link, keyType, declaredLength(req.headers['content-length']))
    if (!admitted) return

    const body = pipeline(req, createIdleTimeoutStream(BODY_IDLE_MS, BODY_MIN_BYTES_PER_INTERVAL), err => {
      if (err instanceof IdleTimeoutError) log('Dropped upload ' + admitted.filename + ': too little received in ' + BODY_IDLE_MS / 1000 + ' s')
    })
    const result = await forwardUpload(admitted.permit, incomingUpload(admitted, body), abortOnClose(res))
    finishUpload(res, admitted, result)
  }
}
