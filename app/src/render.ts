import immich from './immich'
import { Response } from 'express-serve-static-core'
import { Asset, AssetType, ImageSize, IncomingShareRequest, SharedLink } from './types'
import { canDownload, escapeHtml, getConfigOption, toString } from './functions'
import archiver from 'archiver'
import { respondToInvalidRequest } from './invalidRequestHandler'
import { sanitize } from './includes/sanitize'
import { h } from 'preact'
import { renderPage } from './views/_render'
import { Gallery, GalleryItem, GalleryProps } from './views/gallery'

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
      const endpoint = this.resolveImageEndpoint(immich.validateImageSize(size))
      subpath = endpoint.subpath
      sizeQueryParam = endpoint.sizeQueryParam
      attachment = endpoint.attachment
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
      res.setHeader('Content-Disposition', `attachment; filename="${this.getFilename(asset)}"`)
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
   * or fullsize image are silently downgraded to preview — the operator has
   * opted out of serving full-resolution files. (The original may also be a
   * RAW/HEIC file the browser can't render.)
   */
  private resolveImageEndpoint (size: ImageSize): { subpath: string; sizeQueryParam?: string; attachment: boolean } {
    const allowOriginal = getConfigOption('ipp.downloadOriginalPhoto', true)
    if (size === ImageSize.original && allowOriginal) {
      return { subpath: '/original', attachment: true }
    }
    if (size === ImageSize.fullsize && allowOriginal) {
      return { subpath: '/thumbnail', sizeQueryParam: 'fullsize', attachment: false }
    }
    if (size === ImageSize.thumbnail) {
      return { subpath: '/thumbnail', attachment: false }
    }
    // preview, or original/fullsize downgraded because downloadOriginalPhoto is off
    return { subpath: '/thumbnail', sizeQueryParam: 'preview', attachment: false }
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
    // You can specify this in your docker-compose file, or send it dynamically as a `publicBaseUrl` header
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || res.req.headers.publicBaseUrl || (res.req.protocol + '://' + res.req.headers.host)

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
        downloadUrl = immich.videoUrl(share.key, asset.id)
      }
      if (getConfigOption('ipp.downloadOriginalPhoto', true)) {
        downloadUrl = immich.photoUrl(share.key, asset.id, ImageSize.original)
      }

      const thumbnailUrl = immich.photoUrl(share.key, asset.id, ImageSize.thumbnail)
      const previewSize = immich.getPreviewImageSize(asset)
      const previewUrl = immich.photoUrl(share.key, asset.id, previewSize)
      // Emit a zoom-upgrade URL for the lightbox only when it would actually
      // be larger than the preview. GIFs already serve as `original` (to keep
      // animation), and if the operator has disabled original downloads they
      // don't want full-res served at all.
      const fullsizeUrl = previewSize === ImageSize.preview && getConfigOption('ipp.downloadOriginalPhoto', true)
        ? immich.photoUrl(share.key, asset.id, ImageSize.fullsize)
        : undefined
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
        fullsizeUrl,
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
   * Download all assets in a share as a zip file
   */
  async downloadAll (res: Response, share: SharedLink) {
    await this.downloadAssets(res, share, share.assets)
  }

  /**
   * Stream the given assets back as a zip file. Caller is responsible for
   * checking that every asset belongs to the share (security boundary).
   */
  async downloadAssets (res: Response, share: SharedLink, assets: Asset[]) {
    const downloadOriginalAsset = getConfigOption('ipp.downloadOriginalPhoto', true)
    res.setHeader('Content-Type', 'application/zip')
    let filename = (sanitize(this.title(share)) || 'photos') + '.zip'
    filename = encodeURI(filename)
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`)
    const archive = archiver('zip', { zlib: { level: 6 } })
    archive.pipe(res)
    await Promise.all(assets.map(async (asset) => {
      const endpoint = downloadOriginalAsset ? 'original' : 'thumbnail'
      const url = immich.buildUrl(immich.apiUrl() + '/assets/' + encodeURIComponent(asset.id) + '/' + endpoint, {
        key: asset.key,
        password: asset.password,
        size: downloadOriginalAsset ? '' : 'preview'
      })
      const data = await fetch(url)
      if (!data.ok) {
        console.warn(`Failed to fetch asset: ${asset.id}`)
        return
      }
      archive.append(Buffer.from(await data.arrayBuffer()), { name: this.getFilename(asset) })
    }))
    await archive.finalize()
    archive.on('end', () => res.end())
  }

  /**
   * Generate a filename for the downloaded asset based on the configuration option chosen
   */
  getFilename (asset: Asset) {
    const extension = asset.originalFileName?.match(/(\.\w+)$/)?.[1] || ''
    switch (getConfigOption('ipp.downloadedFilename')) {
      case 1:
        // Immich's ID number for this asset
        return asset.id + extension
      case 2:
        // A sanitised version of the ID number
        return 'img_' + asset.id.slice(0, 8) + extension
      default:
        // By default, it will choose the asset's original filename
        return asset.originalFileName || (asset.id + extension)
    }
  }
}

const render = new Render()

export default render
