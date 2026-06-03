import { apiUrl, authHeaders, buildUrl } from '../immich'
import { Response } from 'express-serve-static-core'
import { Asset, ImageSize, KeyType, SharedLink } from '../types'
import { getConfigOption } from '../config/access'
import { log } from '../utils/log'
import archiver from 'archiver'
import { sanitize } from '../utils/sanitize'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { promises as fs, createWriteStream } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { resolveImageEndpoint, ImageEndpoint } from './asset'
import { title } from '../share'
import { getFilename } from '../gallery/filename'

/**
 * A pass-through Transform that destroys itself if no data flows through for
 * `idleMs`. The timer is set when the transform is created and reset on every
 * chunk, so a slow-but-steady download (large video over a slow link) keeps
 * going, while a genuinely stalled connection still fails fast.
 */
function createIdleTimeoutStream (idleMs: number): Transform {
  let timer: NodeJS.Timeout | undefined
  const transform: Transform = new Transform({
    transform (chunk, _, cb) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => transform.destroy(new Error(`No data received for ${idleMs}ms`)), idleMs)
      cb(null, chunk)
    },
    flush (cb) {
      if (timer) clearTimeout(timer)
      cb()
    }
  })
  // Arm the timer immediately so a response that returns headers but never
  // sends a body also times out.
  timer = setTimeout(() => transform.destroy(new Error(`No data received for ${idleMs}ms`)), idleMs)
  return transform
}

/**
 * Returns a function that runs at most `limit` async tasks concurrently.
 * Tasks queue when the limit is reached and resume in FIFO order.
 */
function createLimiter (limit: number) {
  let active = 0
  const queue: Array<() => void> = []
  return async function run<T> (fn: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>(resolve => queue.push(resolve))
    }
    active++
    try {
      return await fn()
    } finally {
      active--
      const next = queue.shift()
      if (next) next()
    }
  }
}

/**
 * Download all assets in a share as a zip file.
 */
export async function downloadAll (res: Response, share: SharedLink) {
  await downloadAssets(res, share, share.assets)
}

/**
 * Stream the given assets back as a zip file.
 *
 * Pattern adapted from Immich's own download service:
 *   https://github.com/immich-app/immich/blob/main/server/src/services/download.service.ts
 *
 * Per asset, the upstream fetch is two phases:
 *   1. Get the response headers (retried up to 3 times with linear backoff,
 *      bounded by a 20s header-receipt timeout).
 *   2. Stream the body to a temp file, guarded by an idle timeout that
 *      resets on every chunk. A genuinely stalled connection fails fast; a
 *      slow-but-steady transfer (large video over a slow link) completes.
 *
 * If any asset ultimately fails, the in-flight download is aborted mid-stream:
 * the archive is aborted, the HTTP response socket is destroyed, and the
 * failure is logged. We do this (rather than silently omitting the asset)
 * because by the time we know the asset failed we've already sent a 200
 * response to the client, so the only way to signal "your zip is incomplete"
 * is to terminate the response - leaving the user with a visibly broken/
 * truncated download instead of a zip that's quietly missing files.
 */
export async function downloadAssets (res: Response, share: SharedLink, assets: Asset[]) {
  res.setHeader('Content-Type', 'application/zip')
  let filename = (sanitize(title(share)) || 'photos') + '.zip'
  filename = encodeURI(filename)
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`)
  // Hint to intermediate proxies (Nginx, etc.) not to buffer this response.
  res.setHeader('X-Accel-Buffering', 'no')
  // STORE rather than deflate - photos and videos are already compressed,
  // this is the same as Immich does
  const archive = archiver('zip', { store: true })
  archive.pipe(res)

  const maxAttempts = 3
  const headerTimeoutMs = 20_000
  const idleTimeoutMs = 20_000
  const concurrency = Math.max(1, getConfigOption('ipp.downloadFromImmichConcurrencyLimit', 8) as number)

  const stagingDir = await fs.mkdtemp(join(tmpdir(), 'ipp-zip-'))
  let aborted = false

  type StagedAsset = { tempfile: string, asset: Asset, endpoint: ImageEndpoint }
  type Failure = { asset: Asset, url: string, status?: number, error?: unknown }

  const stageOne = async (asset: Asset, index: number): Promise<StagedAsset | { failure: Failure } | null> => {
    // Skip work if another stage has already triggered an abort.
    if (aborted) return null

    const endpoint = resolveImageEndpoint(ImageSize.original, asset)
    const url = buildUrl(apiUrl() + '/assets/' + encodeURIComponent(asset.id) + endpoint.subpath, {
      [asset.keyType || 'key']: asset.key,
      size: endpoint.sizeQueryParam
    })
    const reqAuthHeaders = await authHeaders(asset.keyType || KeyType.key, asset.key, asset.password)

    // Phase 1: get response headers, retrying on transient failure.
    // We use AbortController + a clearable timer rather than
    // `AbortSignal.timeout` because the signal we pass to fetch stays bound
    // to the response body - if the timeout fires after headers arrive but
    // while the body is still streaming, the body read errors out. The
    // header timer is cleared as soon as we have a response; from there the
    // idle-timeout transform downstream guards against stalled bodies.
    let response: globalThis.Response | undefined
    let lastStatus: number | undefined
    let lastError: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (aborted) return null
      const controller = new AbortController()
      const headerTimer = setTimeout(() => controller.abort(new Error(`No response headers within ${headerTimeoutMs}ms`)), headerTimeoutMs)
      try {
        const data = await fetch(url, { signal: controller.signal, headers: reqAuthHeaders })
        clearTimeout(headerTimer)
        if (data.ok) {
          response = data
          break
        }
        await data.body?.cancel()
        lastStatus = data.status
        lastError = undefined
      } catch (e) {
        clearTimeout(headerTimer)
        lastError = e
        lastStatus = undefined
      }
      if (attempt < maxAttempts) {
        const reason = lastStatus !== undefined
          ? `HTTP ${lastStatus}`
          : (lastError instanceof Error ? lastError.message : String(lastError))
        log(`Retrying asset ${asset.id} (attempt ${attempt + 1}/${maxAttempts}) after ${reason}`)
        // Linear backoff between attempts to avoid hammering a struggling server.
        await new Promise(resolve => setTimeout(resolve, 500 * attempt))
      }
    }

    if (!response || !response.body) {
      return { failure: { asset, url, status: lastStatus, error: lastError } }
    }

    // Phase 2: stream body to a temp file, guarded by an idle timeout.
    // Use the array index in the path so we never collide on duplicate IDs.
    const tempfile = join(stagingDir, `${index}-${asset.id}`)
    // `response.body` is the global/undici ReadableStream<Uint8Array>;
    // Readable.fromWeb expects node:stream/web's ReadableStream<any>. The
    // two are structurally compatible at runtime but TS sees them as
    // distinct nominal types, so a cast is needed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = Readable.fromWeb(response.body as any)
    try {
      await pipeline(body, createIdleTimeoutStream(idleTimeoutMs), createWriteStream(tempfile))
    } catch (e) {
      return { failure: { asset, url, error: e } }
    }

    return { tempfile, asset, endpoint }
  }

  try {
    const limit = createLimiter(concurrency)
    // Kick off every stage at once; the limiter caps how many run concurrently.
    // The map preserves input order so the consumer below archives in order.
    const stages = assets.map((asset, index) => limit(() => stageOne(asset, index)))

    let failure: Failure | null = null
    for (const stage of stages) {
      const result = await stage
      if (result === null) break // aborted by an earlier stage
      if ('failure' in result) {
        aborted = true
        failure = result.failure
        break
      }
      // archive.file queues the entry; archiver lazily opens and reads it.
      archive.file(result.tempfile, { name: getFilename(result.asset, result.endpoint.servedSize) })
    }

    // After abort, wait for any in-flight stages to settle before we delete
    // the staging dir. stageOne never rejects (errors become failure objects),
    // so a plain Promise.all is safe.
    if (aborted) await Promise.all(stages)

    if (failure) {
      const f = failure as Failure
      const detail = f.status !== undefined
        ? `HTTP ${f.status}`
        : (f.error instanceof Error ? f.error.message : String(f.error))
      log(`Aborting zip download for share ${share.key}: failed to fetch asset ${f.asset.id} from ${f.url} (${detail})`)
      archive.abort()
      res.destroy()
      return
    }

    // finalize() resolves when archiver has finished writing the zip output,
    // which means every queued tempfile has been read. Safe to delete after.
    await archive.finalize()
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => { /* best effort */ })
  }
}
