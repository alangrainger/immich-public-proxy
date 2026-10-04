import { assetFetchUrl, authHeadersForAsset } from '../immich'
import { Response } from 'express-serve-static-core'
import { Asset, SharedLink } from '../types'
import { log } from '../utils/log'
import archiver, { Archiver } from 'archiver'
import { sanitize } from '../utils/sanitize'
import { resolveDownloadEndpoint, servedMimeFrom, ImageEndpoint } from '../gallery/sizing'
import { title } from '../share'
import { getFilename } from '../gallery/filename'
import { readableFromWeb } from '../utils/webStream'
import { respondToInvalidRequest } from '../invalidRequestHandler'

/** Attempts to get response headers from Immich for one asset before giving up. */
const MAX_ATTEMPTS = 3
/** How long to wait for Immich's response headers on each attempt. */
const HEADER_TIMEOUT_MS = 20_000

/**
 * Download all assets in a share as a zip file.
 */
export async function downloadAll (res: Response, share: SharedLink) {
  await downloadAssets(res, share, share.assets)
}

type FetchedAsset = { response: globalThis.Response, asset: Asset, endpoint: ImageEndpoint, servedMime?: string, url: string }
type Failure = { asset: Asset, url: string, status?: number, error?: unknown }
type FetchOutcome = FetchedAsset | { failure: Failure } | null

/**
 * Stream the given assets back as a zip file.
 *
 * Immich's own download service (server/src/services/download.service.ts)
 * zips files straight off local disk. We're a proxy fetching over HTTP, so
 * each asset is fetched from Immich and its body piped directly into the
 * archive - nothing is staged to disk or held in memory, so a zip of any
 * size needs only a few stream buffers #289.
 *
 * Assets are fetched strictly one at a time. Archiver writes entries
 * serially anyway, and an unread response body would hold an idle
 * connection open on Immich for as long as the current entry takes to reach
 * the visitor - long enough for a reverse proxy to close it. The cost is
 * Immich's per-request overhead between entries, which is negligible next
 * to the visitor's link speed.
 *
 * Failure handling:
 *   - Headers fail (after retries) before anything has been sent: an
 *     ordinary 404, so the visitor sees an error page rather than an empty
 *     download. The real reason goes to the server log.
 *   - Anything fails once the zip is on the wire: the socket is destroyed
 *     and the visitor gets a visibly broken download. That's deliberate; the
 *     alternative is a zip quietly missing files.
 *   - Visitor disconnects: the upstream fetch is aborted so Immich stops
 *     streaming, and the archive is torn down so it releases the in-flight
 *     entry #284.
 *
 * There is no body-level idle timeout: with the visitor as the sink, a slow
 * or paused client stalls the flow just like a stalled upstream would, so a
 * timer on the body can't tell them apart. The header timeout still bounds
 * how long Immich may take to start answering.
 *
 * Zip entries use STORE (no compression), since photos and videos are
 * already compressed.
 */
export async function downloadAssets (res: Response, share: SharedLink, assets: Asset[]) {
  const archive = archiver('zip', { store: true })
  // Without a listener, an archiver 'error' emission would crash the process.
  archive.on('error', e => log(`Archiver error for share ${share.key}: ${e.message}`))

  const controller = new AbortController()
  let clientGone = false
  let resolveClosed!: () => void
  const resClosed = new Promise<void>(resolve => { resolveClosed = resolve })
  const onClose = () => {
    if (res.writableFinished) return
    clientGone = true
    controller.abort()
    resolveClosed()
  }
  res.once('close', onClose)
  if (res.closed) onClose()

  // Headers and piping are deferred until the first asset has arrived, so a
  // failure before then can still be answered with a normal error response.
  let piped = false

  for (const asset of assets) {
    if (controller.signal.aborted) break
    const fetched = await fetchOne(share, asset, controller.signal)
    if (fetched === null) break // aborted while waiting on Immich
    if ('failure' in fetched) {
      if (!piped) {
        archive.abort()
        respondToInvalidRequest(res, 404, describeFailure(share, fetched.failure))
        return
      }
      abortDownload(archive, res, share, fetched.failure)
      return
    }
    if (!piped) {
      startZipResponse(res, share, archive)
      piped = true
    }
    const entry = await appendEntry(archive, fetched)
    if (entry !== 'done') {
      if (clientGone) break
      controller.abort()
      abortDownload(archive, res, share, { asset: fetched.asset, url: fetched.url, error: entry.error })
      return
    }
  }

  if (clientGone) {
    log(`Zip download for share ${share.key} cancelled by client`)
    teardownArchive(archive, res)
    return
  }
  if (!piped) startZipResponse(res, share, archive) // empty selection: still a valid (empty) zip

  // finalize() resolves when archiver has finished writing the zip output.
  // Raced against client disconnect because finalize() never settles once
  // the response is destroyed. The inline rejection handler also stops a
  // late finalize failure becoming an unhandled rejection after a lost race.
  const finished = archive.finalize().then(() => 'done' as const, () => 'error' as const)
  const outcome = await Promise.race([finished, resClosed.then(() => 'closed' as const)])
  if (outcome !== 'done') {
    if (outcome === 'closed') log(`Zip download for share ${share.key} cancelled by client`)
    // 'error' was already logged by the archiver error listener
    teardownArchive(archive, res)
  }
}

function startZipResponse (res: Response, share: SharedLink, archive: Archiver) {
  res.setHeader('Content-Type', 'application/zip')
  let filename = (sanitize(title(share)) || 'photos') + '.zip'
  filename = encodeURI(filename)
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`)
  // Hint to intermediate proxies (Nginx, etc.) not to buffer this response.
  res.setHeader('X-Accel-Buffering', 'no')
  res.setHeader('Cache-Control', 'no-store')
  archive.pipe(res)
}

/**
 * Pipe one fetched body into the archive and wait for the entry to be fully
 * written (archiver's 'entry' event fires after the data descriptor, which
 * is later than the body's own end).
 *
 * On a body error compress-commons forwards the error to archiver's 'error'
 * event and then moves on to the next queued entry, so the caller must abort
 * the download itself. The body listener covers the tick between append()
 * and archiver attaching its own handler, when an unhandled 'error' would
 * otherwise crash the process.
 */
function appendEntry (archive: Archiver, fetched: FetchedAsset): Promise<'done' | { error: unknown }> {
  return new Promise(resolve => {
    if (!fetched.response.body) {
      resolve({ error: new Error('Upstream response has no body') })
      return
    }
    const body = readableFromWeb(fetched.response.body)
    const cleanup = () => {
      archive.off('entry', onEntry)
      archive.off('error', onError)
      body.off('error', onError)
    }
    const onEntry = () => { cleanup(); resolve('done') }
    const onError = (error: unknown) => { cleanup(); resolve({ error }) }
    archive.once('entry', onEntry)
    archive.once('error', onError)
    body.once('error', onError)
    archive.append(body, { name: getFilename(fetched.asset, fetched.endpoint.servedSize, fetched.servedMime) })
  })
}

function describeFailure (share: SharedLink, failure: Failure): string {
  const detail = failure.status !== undefined
    ? `HTTP ${failure.status}`
    : (failure.error instanceof Error ? failure.error.message : String(failure.error))
  return `Zip download for share ${share.key}: failed to fetch asset ${failure.asset.id} from ${failure.url} (${detail})`
}

function abortDownload (archive: Archiver, res: Response, share: SharedLink, failure: Failure) {
  log('Aborting ' + describeFailure(share, failure))
  teardownArchive(archive, res)
}

/**
 * Tear down an aborted archive so it releases its resources. `abort()` alone
 * is not enough; it kills the queue but leaves any in-flight entry paused,
 * holding its source stream open forever #284
 */
function teardownArchive (archive: Archiver, res: Response) {
  archive.abort()
  archive.unpipe(res)
  res.destroy()
  archive.resume()
}

/**
 * Fetch one asset's response headers from Immich, retried on transient
 * failure. The body is left unread for the caller to pipe.
 *
 * Returns the fetched asset on success, a wrapped Failure on error, or null
 * if the download was aborted before we got an answer.
 */
async function fetchOne (share: SharedLink, asset: Asset, signal: AbortSignal): Promise<FetchOutcome> {
  if (signal.aborted) return null

  const endpoint = resolveDownloadEndpoint(asset, share.allowDownload !== false)
  const url = assetFetchUrl(asset, endpoint.subpath, endpoint.sizeQueryParam)
  const reqAuthHeaders = await authHeadersForAsset(asset)

  const fetched = await fetchHeadersWithRetry(url, reqAuthHeaders, MAX_ATTEMPTS, HEADER_TIMEOUT_MS, signal, asset)
  if (fetched === null) return null
  if ('failure' in fetched) return { failure: { ...fetched.failure, asset, url } }

  // Album "grid" assets (timeline-sourced) lack originalFileName/Mime, so
  // getFilename would fall back to an id-based name. The `/original` response
  // carries the real name in Content-Disposition and the mime in Content-Type,
  // so recover them from the headers we already fetched - no extra calls.
  const namedAsset = asset.originalFileName ? asset : enrichFromHeaders(asset, fetched.response)

  return { response: fetched.response, asset: namedAsset, endpoint, servedMime: servedMimeFrom(endpoint.subpath, fetched.response), url }
}

/**
 * Fill in originalFileName / originalMimeType from an asset response's
 * `Content-Disposition` / `Content-Type` headers, for assets that arrived
 * without them (lazy album grid assets). Returns a shallow copy so the cached
 * share asset is never mutated.
 */
function enrichFromHeaders (asset: Asset, response: globalThis.Response): Asset {
  const fileName = filenameFromContentDisposition(response.headers.get('content-disposition'))
  const mime = (response.headers.get('content-type') || '').split(';')[0].trim() || undefined
  if (!fileName && !mime) return asset
  return {
    ...asset,
    originalFileName: asset.originalFileName || fileName,
    originalMimeType: asset.originalMimeType || mime
  }
}

/**
 * Extract a filename from a `Content-Disposition` header. Prefers the RFC 5987
 * `filename*=UTF-8''...` form (percent-decoded) over the plain `filename=`.
 * Returns undefined when neither is present.
 */
export function filenameFromContentDisposition (header: string | null): string | undefined {
  if (!header) return undefined
  const extended = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i)
  if (extended) {
    const raw = extended[1].trim().replace(/^"|"$/g, '')
    try {
      return decodeURIComponent(raw)
    } catch (e) {
      return raw
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i)
  return plain ? plain[1].trim() : undefined
}

type HeaderFetchOutcome =
  | { response: globalThis.Response }
  | { failure: { status?: number, error?: unknown } }
  | null

/**
 * GET `url` until we have response headers or run out of attempts. Retries
 * use linear backoff to avoid hammering a struggling upstream.
 *
 * AbortController + clearable timer (rather than `AbortSignal.timeout`)
 * because the signal we pass to fetch stays bound to the response body - if
 * the timeout fires after headers arrive but while the body is still
 * streaming, the body read errors out. We clear the header timer as soon
 * as we have a response.
 *
 * The download-wide `signal` is combined into the fetch signal so that an
 * aborted download (asset failure or client disconnect) cancels the header
 * wait and any in-flight body stream immediately.
 */
async function fetchHeadersWithRetry (
  url: string,
  headers: Record<string, string>,
  maxAttempts: number,
  headerTimeoutMs: number,
  signal: AbortSignal,
  asset: Asset
): Promise<HeaderFetchOutcome> {
  let lastStatus: number | undefined
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal.aborted) return null
    const controller = new AbortController()
    const headerTimer = setTimeout(() => controller.abort(new Error(`No response headers within ${headerTimeoutMs}ms`)), headerTimeoutMs)
    try {
      const data = await fetch(url, { signal: AbortSignal.any([controller.signal, signal]), headers })
      clearTimeout(headerTimer)
      if (data.ok) return { response: data }
      await data.body?.cancel()
      lastStatus = data.status
      lastError = undefined
    } catch (e) {
      clearTimeout(headerTimer)
      lastError = e
      lastStatus = undefined
    }
    if (attempt < maxAttempts && !signal.aborted) {
      const reason = lastStatus !== undefined
        ? `HTTP ${lastStatus}`
        : (lastError instanceof Error ? lastError.message : String(lastError))
      log(`Retrying asset ${asset.id} (attempt ${attempt + 1}/${maxAttempts}) after ${reason}`)
      await new Promise(resolve => setTimeout(resolve, 500 * attempt))
    }
  }
  return { failure: { status: lastStatus, error: lastError } }
}
