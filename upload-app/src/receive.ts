import { pipeline } from 'stream'
import { Request, Response } from 'express-serve-static-core'
import dayjs from 'dayjs'
import { abortOnClose, KeyType, log, respondToInvalidRequest, SharedLink } from '@ipp/core'
import { byteBudget, filenamePrefix, maxFileSize, rateLimit } from './config'
import { uploadFilename } from './filename'
import { forwardUpload } from './forward'
import { authoriseUpload } from './gate'
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
const BODY_IDLE_MS = 60_000
const BODY_MIN_BYTES_PER_INTERVAL = 8 * 1024 * BODY_IDLE_MS / 1000

/**
 * Answer an upload the server will not take, in the shape the page reads.
 * The connection closes after it (see `index.ts`), so a body still in flight
 * stops costing its full bandwidth.
 */
function refuse (res: Response, status: number, reason: string): void {
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

/**
 * Build the handler for `POST <share>/upload`, with its rate limit and byte
 * budget read from config. Called once, after the config has loaded.
 *
 * Once the share has passed the gate, failures a visitor can act on answer
 * with a status and a short JSON reason rather than the 404 policy.
 */
export function createUploadReceiver () {
  // Keyed on address and share; behind a reverse proxy every visitor has the proxy's address
  const rate = createWindowBudget({ limit: rateLimit(), windowMs: 60_000 })
  const budget = createWindowBudget({ limit: byteBudget(), windowMs: 60 * 60_000 })
  const maxBytes = maxFileSize()
  const prefix = filenamePrefix()

  return async function receiveUpload (req: Request, res: Response, link: SharedLink, keyType: KeyType): Promise<void> {
    const key = req.params.key
    const permit = authoriseUpload(link, key, keyType, req.password)
    if (!permit) {
      respondToInvalidRequest(res, 404, 'Share does not accept uploads')
      return
    }
    const shareId = link.id || key

    const length = declaredLength(req.headers['content-length'])
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

    const filename = uploadFilename(req.query.filename, prefix)
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

    const body = pipeline(req, createIdleTimeoutStream(BODY_IDLE_MS, BODY_MIN_BYTES_PER_INTERVAL), err => {
      if (err instanceof IdleTimeoutError) log('Dropped upload ' + filename + ': too little received in ' + BODY_IDLE_MS / 1000 + ' s')
    })
    const result = await forwardUpload(permit, {
      filename,
      mimeType,
      fileCreatedAt: uploadTimestamp(req.query.fileCreatedAt),
      fileModifiedAt: uploadTimestamp(req.query.fileModifiedAt),
      body,
      maxBytes: length
    }, abortOnClose(res))

    if (!result.ok) {
      reserved.release()
      // The visitor hung up; there is nobody left to answer
      if (result.status === 499) return
      refuse(res, result.status, result.reason)
      return
    }

    log('Received upload ' + filename + ' for share ' + (link.slug || link.id) + ' (Immich result: ' + result.status + ')')
    res.json({ status: result.status })

    // After the reply, so a slow webhook never holds up the visitor
    sendNotification(buildNotification(
      link,
      { name: filename, size: result.bytes, type: mimeType },
      { id: result.id, status: result.status }
    ))
  }
}
