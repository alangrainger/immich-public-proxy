import {
  apiUrl,
  authHeaders,
  buildUrl,
  requiresOriginal,
  validateImageSize
} from '../immich'
import { Response } from 'express-serve-static-core'
import { Asset, AssetType, ImageSize, IncomingShareRequest, KeyType } from '../types'
import { getConfigOption } from '../config/access'
import { respondToInvalidRequest } from '../invalidRequestHandler'
import { getFilename } from '../gallery/filename'

export interface ImageEndpoint {
  subpath: string
  sizeQueryParam?: string
  attachment: boolean
  servedSize: ImageSize
}

/**
 * Stream an asset from Immich back to the client.
 *
 * Errors from Immich are always reported to the client as 404 - see
 * invalidRequestHandler. Upstream status codes are never surfaced. Trashed
 * or locked assets are handled implicitly: Immich's own endpoints refuse
 * to serve them, and the upstream failure surfaces as a client 404.
 */
export async function assetBuffer (req: IncomingShareRequest, res: Response, asset: Asset, size?: ImageSize | string) {
  const headerList = ['content-type', 'content-length', 'last-modified', 'etag']
  const fetchHeaders: Record<string, string> = {}
  let subpath: string
  let sizeQueryParam: string | undefined
  let attachment = false
  let servedSize: ImageSize | undefined

  if (asset.type === AssetType.video) {
    subpath = '/video/playback'
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
    const endpoint = resolveImageEndpoint(validateImageSize(size), asset)
    subpath = endpoint.subpath
    sizeQueryParam = endpoint.sizeQueryParam
    attachment = endpoint.attachment
    servedSize = endpoint.servedSize
  }

  const url = buildUrl(apiUrl() + '/assets/' + encodeURIComponent(asset.id) + subpath, {
    [asset.keyType || 'key']: asset.key,
    size: sizeQueryParam
  })
  const reqHeaders = await authHeaders(asset.keyType || KeyType.key, asset.key, asset.password)
  const data = await fetch(url, { headers: { ...fetchHeaders, ...reqHeaders } })

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
    const filename = encodeURI(getFilename(asset, servedSize))
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`)
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
 * image are silently downgraded to preview - the operator has opted out of
 * serving full-resolution files. (The original may also be a RAW/HEIC file
 * the browser can't render.)
 *
 * The downgrade is bypassed for assets where `requiresOriginal` is true
 * (videos, animated images), because for those formats the preview is an
 * entirely different artifact (still poster / static JPEG) rather than a
 * lower-res version of the same content.
 *
 * `servedSize` reflects what Immich will actually return after the downgrade,
 * which may differ from the requested `size`. Callers use it to derive a
 * filename whose extension matches the bytes (see getFilename).
 */
export function resolveImageEndpoint (size: ImageSize, asset: Asset): ImageEndpoint {
  const allowOriginal = getConfigOption('ipp.downloadOriginalPhoto', true) || requiresOriginal(asset)
  if (size === ImageSize.original && allowOriginal) {
    return { subpath: '/original', attachment: true, servedSize: ImageSize.original }
  }
  if (size === ImageSize.thumbnail) {
    return { subpath: '/thumbnail', attachment: false, servedSize: ImageSize.thumbnail }
  }
  // preview, or original downgraded because downloadOriginalPhoto is off
  return { subpath: '/thumbnail', sizeQueryParam: 'preview', attachment: false, servedSize: ImageSize.preview }
}
