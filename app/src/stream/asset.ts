import {
  assetFetchUrl,
  authHeadersForAsset,
  fetchAssetDetail,
  validateImageSize
} from '../immich'
import { Response } from 'express-serve-static-core'
import { Asset, ImageSize, IncomingShareRequest, SharedLink } from '../types'
import { respondToInvalidRequest } from '../invalidRequestHandler'
import { attachmentDisposition, getFilename, servedMimeFrom } from '../gallery/filename'
import { isVideoAsset, resolveDownloadEndpoint, resolveImageEndpoint } from '../gallery/sizing'
import { pipeline } from 'stream/promises'
import { readableFromWeb } from '../utils/webStream'
import { log } from '../utils/log'

/**
 * Stream an asset from Immich back to the client.
 *
 * Errors from Immich are always reported to the client as 404 - see
 * invalidRequestHandler. Upstream status codes are never surfaced. Trashed
 * or locked assets are handled implicitly: Immich's own endpoints refuse
 * to serve them, and the upstream failure surfaces as a client 404.
 */
export async function assetBuffer (req: IncomingShareRequest, res: Response, asset: Asset, size?: ImageSize | string, share?: SharedLink, forceVideoPlayback = false) {
  /*
  Abort the upstream fetch as soon as the visitor goes away, so a cancelled
  download doesn't leave Immich streaming #288.
  */
  const upstream = new AbortController()
  const onClose = () => { if (!res.writableFinished) upstream.abort() }
  res.once('close', onClose)
  if (res.closed) onClose()

  const headerList = ['content-type', 'content-length', 'last-modified', 'etag']
  const fetchHeaders: Record<string, string> = {}
  let subpath: string
  let sizeQueryParam: string | undefined
  let attachment = false
  let servedSize: ImageSize | undefined

  const requested = validateImageSize(size)
  const useVideoPlayback = forceVideoPlayback || (isVideoAsset(asset) && requested === ImageSize.original && share?.allowDownload === false)

  if (useVideoPlayback) {
    subpath = '/video/playback'
    attachment = requested === ImageSize.original
    servedSize = ImageSize.original
    res.setHeader('accept-ranges', 'bytes')
    // Only chunk when the client sent a Range header. A browser <video>
    // element does, so playback still streams in 2.5 MB chunks. Clients
    // that don't (wget, right-click "Save As", link unfurlers) get the
    // full file with 200 OK; otherwise they'd save a truncated 2.5 MB
    // partial response as the whole video.
    if (req.range) {
      const range = req.range.replace(/bytes=/, '').split('-')
      const start = parseInt(range[0], 10) || 0
      const end = parseInt(range[1], 10) || start + 2499999
      fetchHeaders.range = `bytes=${start}-${end}`
      headerList.push('cache-control', 'content-range')
      res.status(206) // Partial Content
    }
  } else {
    // Album "grid" items arrive without originalMimeType. The fullsize tier
    // needs it to pick /original (web formats) vs ?size=fullsize (RAW/HEIF), so
    // fetch the asset detail on demand (cached) before resolving.
    if (requested === ImageSize.fullsize && !asset.originalMimeType) {
      const detail = await fetchAssetDetail(asset)
      if (detail?.originalMimeType) asset = { ...asset, originalMimeType: detail.originalMimeType }
    }
    const endpoint = requested === ImageSize.original
      ? resolveDownloadEndpoint(asset, share?.allowDownload !== false)
      : resolveImageEndpoint(requested, asset)
    subpath = endpoint.subpath
    sizeQueryParam = endpoint.sizeQueryParam
    attachment = endpoint.attachment
    servedSize = endpoint.servedSize
  }

  const url = assetFetchUrl(asset, subpath, sizeQueryParam)
  const reqHeaders = await authHeadersForAsset(asset)
  let data: globalThis.Response
  try {
    data = await fetch(url, { headers: { ...fetchHeaders, ...reqHeaders }, signal: upstream.signal })
  } catch (e) {
    if (upstream.signal.aborted) return // visitor left before Immich answered
    throw e
  }

  if (data.status < 200 || data.status >= 300) {
    let immichMessage = ''
    try {
      const json = await data.json()
      if (json.message) immichMessage = '\nResponse from Immich: ' + json.message
    } catch (e) { }
    respondToInvalidRequest(res, 404, 'Failed response from Immich for asset ' + asset.id + ' on this URL:\n' + url + immichMessage)
    return
  }

  if (attachment) {
    res.setHeader('X-Accel-Buffering', 'no')
    if (asset.originalFileName) {
      res.setHeader('Content-Disposition', attachmentDisposition(getFilename(asset, servedSize, servedMimeFrom(subpath, data))))
    }
  }
  headerList.forEach(header => {
    const value = data.headers.get(header)
    if (value) res.setHeader(header, value)
  })

  // Express routes HEAD through the GET handler and Node silently drops the
  // body writes, so without this we'd read the whole file from Immich for
  // nothing. The headers above are all a HEAD needs.
  if (req.req.method === 'HEAD' || !data.body) {
    await data.body?.cancel()
    res.end()
    return
  }

  /*
  pipeline (rather than a WritableStream sink around res.write) honours
  backpressure from `res`: a LAN-speed read from Immich can't pile up in
  memory ahead of a slow visitor #288.
  */
  try {
    await pipeline(readableFromWeb(data.body), res)
  } catch (e) {
    if (!isClientAbort(e)) {
      log.warn(`Stream from Immich failed for asset ${asset.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

/**
 * True when a pipeline error means the visitor went away: pipeline saw `res`
 * close early (or found it already closed), or our abort signal, fired from
 * that same close, reached the fetch body first.
 */
function isClientAbort (e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const code = (e as NodeJS.ErrnoException).code
  return code === 'ERR_STREAM_PREMATURE_CLOSE' || code === 'ERR_STREAM_UNABLE_TO_PIPE' || e.name === 'AbortError'
}
