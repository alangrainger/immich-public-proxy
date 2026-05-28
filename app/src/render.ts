import immich from './immich'
import { Response } from 'express-serve-static-core'
import { Asset, AssetType, ImageSize, IncomingShareRequest, SharedLink } from './types'
import { canDownload, escapeHtml, getConfigOption, log, toString } from './functions'
import archiver from 'archiver'
import { respondToInvalidRequest } from './invalidRequestHandler'
import { sanitize } from './includes/sanitize'
import { h } from 'preact'
import { renderPage } from './views/_render'
import { Gallery, GalleryItem, GalleryProps } from './views/gallery'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { promises as fs, createWriteStream } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

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

class Render {
  /**
   * Stream an asset from Immich back to the client.
   *
   * Errors from Immich are always reported to the client as 404 — see
   * invalidRequestHandler. Upstream status codes are never surfaced. Trashed
   * or locked assets are handled implicitly: Immich's own endpoints refuse
   * to serve them, and the upstream failure surfaces as a client 404.
   */
  async assetBuffer (req: IncomingShareRequest, res: Response, asset: Asset, size?: ImageSize | string) {
    const headerList = ['content-type', 'content-length', 'last-modified', 'etag']
    const fetchHeaders: Record<string, string> = {}
    let subpath: string
    let sizeQueryParam: string | undefined
    let attachment = false
    let servedSize: ImageSize | undefined

    if (asset.type === AssetType.video) {
      subpath = '/video/playback'
      // Stream videos in 2.5 MB chunks rather than the entire file
      const range = (req.range || '').replace(/bytes=/, '').split('-')
      const start = parseInt(range[0], 10) || 0
      const end = parseInt(range[1], 10) || start + 2499999
      fetchHeaders.range = `bytes=${start}-${end}`
      headerList.push('cache-control', 'content-range')
      res.setHeader('accept-ranges', 'bytes')
      res.status(206) // Partial Content
    } else {
      const endpoint = this.resolveImageEndpoint(immich.validateImageSize(size), asset)
      subpath = endpoint.subpath
      sizeQueryParam = endpoint.sizeQueryParam
      attachment = endpoint.attachment
      servedSize = endpoint.servedSize
    }

    const url = immich.buildUrl(immich.apiUrl() + '/assets/' + encodeURIComponent(asset.id) + subpath, {
      [asset.keyType || 'key']: asset.key,
      size: sizeQueryParam,
      password: asset.password
    })
    const data = await fetch(url, { headers: fetchHeaders })

    if (data.status < 200 || data.status >= 300) {
      let immichMessage = ''
      try {
        const json = await data.json()
        if (json.message) immichMessage = '\nResponse from Immich: ' + json.message
      } catch (e) { }
      respondToInvalidRequest(res, 404, 'Failed response from Immich for asset ' + asset.id + ' on this URL:\n' + url + immichMessage)
      return
    }

    if (attachment && asset.originalFileName) {
      res.setHeader('Content-Disposition', `attachment; filename="${this.getFilename(asset, servedSize)}"`)
    }
    headerList.forEach(header => {
      const value = data.headers.get(header)
      if (value) res.setHeader(header, value)
    })
    await data.body?.pipeTo(
      new WritableStream({
        write (chunk) { res.write(chunk) }
      })
    )
    res.end()
  }

  /**
   * Map an ImageSize to the Immich endpoint that serves it.
   *
   * Policy: when `ipp.downloadOriginalPhoto` is off, requests for the original
   * image are silently downgraded to preview — the operator has opted out of
   * serving full-resolution files. (The original may also be a RAW/HEIC file
   * the browser can't render.)
   *
   * The downgrade is bypassed for assets where `immich.requiresOriginal` is
   * true (videos, animated images), because for those formats the preview is
   * an entirely different artifact (still poster / static JPEG) rather than a
   * lower-res version of the same content.
   *
   * `servedSize` reflects what Immich will actually return after the downgrade,
   * which may differ from the requested `size`. Callers use it to derive a
   * filename whose extension matches the bytes (see getFilename).
   */
  private resolveImageEndpoint (size: ImageSize, asset: Asset): { subpath: string; sizeQueryParam?: string; attachment: boolean; servedSize: ImageSize } {
    const allowOriginal = getConfigOption('ipp.downloadOriginalPhoto', true) || immich.requiresOriginal(asset)
    if (size === ImageSize.original && allowOriginal) {
      return { subpath: '/original', attachment: true, servedSize: ImageSize.original }
    }
    if (size === ImageSize.thumbnail) {
      return { subpath: '/thumbnail', attachment: false, servedSize: ImageSize.thumbnail }
    }
    // preview, or original downgraded because downloadOriginalPhoto is off
    return { subpath: '/thumbnail', sizeQueryParam: 'preview', attachment: false, servedSize: ImageSize.preview }
  }

  /**
   * Map an Immich asset MIME type to a file extension (including the dot).
   *
   * Returns '' for unknown types so callers can fall back to parsing the
   * extension from `originalFileName`. The map only covers the formats Immich
   * commonly serves; obscure RAW types are expected to fall through to the
   * filename fallback (which usually has a correct extension).
   */
  private mimeToExt (mime: string | undefined): string {
    if (!mime) return ''
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/heic': '.heic',
      'image/heif': '.heif',
      'image/avif': '.avif',
      'image/tiff': '.tiff',
      'image/svg+xml': '.svg',
      'image/x-adobe-dng': '.dng',
      'video/mp4': '.mp4',
      'video/quicktime': '.mov',
      'video/webm': '.webm',
      'video/x-msvideo': '.avi',
      'video/x-matroska': '.mkv'
    }
    return map[mime] || ''
  }

  /**
   * Render a gallery page for a given SharedLink.
   *
   * @param res - ExpressJS Response
   * @param share - Immich `shared-link` containing the assets to show in the gallery
   * @param [openItem] - Immediately open the lightbox to the Nth item when the gallery loads
   */
  async gallery (res: Response, share: SharedLink, openItem?: number) {
    // publicBaseUrl is used for the og:image, which requires a fully qualified URL.
    // You can specify this in your docker-compose file via the PUBLIC_BASE_URL env var.
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || (res.req.protocol + '://' + res.req.headers.host)

    // Date grouping needs chronological order; sort newest-first when enabled
    // (overrides any album.order the upstream applied).
    const groupByDate = !!getConfigOption('ipp.gallery.groupByDate', false)
    if (groupByDate) {
      share.assets.sort((a, b) => (b.fileCreatedAt || '').localeCompare(a.fileCreatedAt || ''))
    }

    // Build structured items in parallel
    const items: GalleryItem[] = await Promise.all(share.assets.map(async (asset): Promise<GalleryItem> => {
      let videoData: string | undefined
      let downloadUrl: string | undefined
      if (asset.type === AssetType.video) {
        videoData = JSON.stringify({
          source: [
            {
              src: immich.videoUrl(share.key, asset.id),
              type: await immich.getVideoContentType(asset)
            }
          ],
          attributes: {
            playsinline: 'playsinline',
            controls: 'controls'
          }
        })
      }
      // Download is offered when the operator allows full-resolution downloads,
      // or when the asset is one that has to come from /original to be useful
      // (video, animated image — see immich.requiresOriginal).
      if (getConfigOption('ipp.downloadOriginalPhoto', true) || immich.requiresOriginal(asset)) {
        downloadUrl = asset.type === AssetType.video
          ? immich.videoUrl(share.key, asset.id)
          : immich.photoUrl(share.key, asset.id, ImageSize.original)
      }

      const thumbnailUrl = immich.photoUrl(share.key, asset.id, ImageSize.thumbnail)
      const previewUrl = immich.photoUrl(share.key, asset.id, immich.getPreviewImageSize(asset))
      const description = getConfigOption('ipp.showMetadata.description', false) && typeof asset?.exifInfo?.description === 'string'
        ? escapeHtml(asset.exifInfo.description)
        : ''

      let width = asset.exifInfo?.exifImageWidth
      let height = asset.exifInfo?.exifImageHeight
      const orientation = asset.exifInfo?.orientation
      if (orientation && ['5', '6', '7', '8'].includes(orientation) && width && height) {
        [width, height] = [height, width]
      }

      return {
        id: asset.id,
        type: asset.type,
        previewUrl,
        thumbnailUrl,
        downloadUrl,
        videoData,
        description: description || undefined,
        downloadFilename: this.getFilename(asset),
        width,
        height,
        thumbhash: asset.thumbhash,
        fileCreatedAt: asset.fileCreatedAt
      }
    }))

    const downloadAllowed = canDownload(share)
    const props: GalleryProps = {
      items,
      title: this.title(share),
      description: getConfigOption('ipp.gallery.showDescription', false) ? this.description(share) : '',
      publicBaseUrl: toString(publicBaseUrl),
      path: '/share/' + share.key,
      showDownload: downloadAllowed,
      showTitle: !!getConfigOption('ipp.gallery.showTitle', true),
      openItem,
      lightboxConfig: {
        // Show download button only if downloading is allowed AND configured.
        showDownload: downloadAllowed && !!getConfigOption('ipp.lightbox.showDownload', true),
        showArrows: !!getConfigOption('ipp.lightbox.showArrows', true),
        mobileArrows: !!getConfigOption('ipp.lightbox.mobileArrows', false)
      },
      groupByDate
    }

    res.send(renderPage(h(Gallery, props)))
  }

  /**
   * Attempt to get a title from the link description or the album title
   */
  title (share: SharedLink) {
    return share.description || share?.album?.albumName || 'Gallery'
  }

  /**
   * Get the Immich shared link description
   */
  description (share: SharedLink) {
    return share?.album?.description || ''
  }

  /**
   * Download all assets in a share as a zip file.
   */
  async downloadAll (res: Response, share: SharedLink) {
    await this.downloadAssets(res, share, share.assets)
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
   * is to terminate the response — leaving the user with a visibly broken/
   * truncated download instead of a zip that's quietly missing files.
   */
  async downloadAssets (res: Response, share: SharedLink, assets: Asset[]) {
    res.setHeader('Content-Type', 'application/zip')
    let filename = (sanitize(this.title(share)) || 'photos') + '.zip'
    filename = encodeURI(filename)
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`)
    // Hint to intermediate proxies (Nginx, etc.) not to buffer this response.
    res.setHeader('X-Accel-Buffering', 'no')
    // STORE rather than deflate — photos and videos are already compressed,
    // this is the same as Immich does
    const archive = archiver('zip', { store: true })
    archive.pipe(res)

    const maxAttempts = 3
    const headerTimeoutMs = 20_000
    const idleTimeoutMs = 20_000
    const concurrency = Math.max(1, getConfigOption('ipp.downloadFromImmichConcurrencyLimit', 8) as number)

    const stagingDir = await fs.mkdtemp(join(tmpdir(), 'ipp-zip-'))
    let aborted = false

    type StagedAsset = { tempfile: string, asset: Asset, endpoint: ReturnType<Render['resolveImageEndpoint']> }
    type Failure = { asset: Asset, url: string, status?: number, error?: unknown }

    const stageOne = async (asset: Asset, index: number): Promise<StagedAsset | { failure: Failure } | null> => {
      // Skip work if another stage has already triggered an abort.
      if (aborted) return null

      const endpoint = this.resolveImageEndpoint(ImageSize.original, asset)
      const url = immich.buildUrl(immich.apiUrl() + '/assets/' + encodeURIComponent(asset.id) + endpoint.subpath, {
        [asset.keyType || 'key']: asset.key,
        password: asset.password,
        size: endpoint.sizeQueryParam
      })

      // Phase 1: get response headers, retrying on transient failure.
      // We use AbortController + a clearable timer rather than
      // `AbortSignal.timeout` because the signal we pass to fetch stays bound
      // to the response body — if the timeout fires after headers arrive but
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
          const data = await fetch(url, { signal: controller.signal })
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
      // @types/node 16 predates the typed Readable.fromWeb signature; the
      // runtime (Node 22+ via the Dockerfile's node:lts-alpine) has it.
      const body = (Readable as unknown as { fromWeb: (s: unknown) => Readable }).fromWeb(response.body)
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
        archive.file(result.tempfile, { name: this.getFilename(result.asset, result.endpoint.servedSize) })
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

  /**
   * Generate a filename for the downloaded asset based on the configuration option chosen.
   *
   * The extension reflects what bytes the user will receive, not what the
   * original was — when Immich downgrades an image-original to preview (see
   * resolveImageEndpoint), the served bytes are JPEG even if the original is
   * HEIC/DNG/RAW, and the filename must match the bytes.
   *
   * @param asset
   * @param [servedSize] - what size Immich will actually serve. Defaults to
   *   ImageSize.original (the bytes match the original asset).
   */
  getFilename (asset: Asset, servedSize: ImageSize = ImageSize.original) {
    let extension: string
    if (servedSize === ImageSize.original) {
      // Bytes match the original asset (image as-is, or video container from
      // /video/playback). Prefer the MIME type since `originalFileName` may
      // be missing an extension; fall back to the filename for MIME types
      // not in our map (uncommon RAW formats etc.).
      extension = this.mimeToExt(asset.originalMimeType) ||
        asset.originalFileName?.match(/(\.\w+)$/)?.[1] || ''
    } else if (servedSize === ImageSize.thumbnail) {
      // Immich currently returns thumbnails as image/webp (verified against
      // the live API). If Immich changes thumbnail format, update here.
      extension = '.webp'
    } else {
      // Preview. Immich currently returns image/jpeg for `?size=preview`
      // (verified against the live API), including for video posters. If
      // Immich changes preview format, update here.
      extension = '.jpg'
    }

    switch (getConfigOption('ipp.downloadedFilename')) {
      case 1:
        // Immich's ID number for this asset
        return asset.id + extension
      case 2:
        // A sanitised version of the ID number
        return 'img_' + asset.id.slice(0, 8) + extension
      default:
        // By default, use the asset's original filename. When we're serving
        // a downgraded preview/thumbnail, swap the extension so it matches
        // the actual bytes (e.g. photo.heic original → photo.jpg preview).
        if (!asset.originalFileName) return asset.id + extension
        if (servedSize !== ImageSize.original) {
          return asset.originalFileName.replace(/\.[^.]+$/, '') + extension
        }
        return asset.originalFileName
    }
  }
}

const render = new Render()

export default render
