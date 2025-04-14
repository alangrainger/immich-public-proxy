import immich from './immich'
import { Response } from 'express-serve-static-core'
import { Asset, AssetType, ImageSize, IncomingShareRequest, SharedLink } from './types'
import { canDownload, getConfigOption } from './functions'
import archiver from 'archiver'
import { respondToInvalidRequest } from './invalidRequestHandler'

class Render {
  lgConfig

  constructor () {
    this.lgConfig = getConfigOption('lightGallery', {})
  }

  /**
   * Stream data from Immich back to the client
   */
  async assetBuffer (req: IncomingShareRequest, res: Response, asset: Asset, size?: ImageSize | string) {
    // Prepare the request
    const headerList = ['content-type', 'content-length', 'last-modified', 'etag']
    size = immich.validateImageSize(size)
    let subpath, sizeQueryParam
    if (asset.type === AssetType.video) {
      subpath = '/video/playback'
    } else if (asset.type === AssetType.image) {
      // For images, there are three combinations of path + query string, depending on image size
      if (size === ImageSize.original && getConfigOption('ipp.downloadOriginalPhoto', true)) {
        subpath = '/original'
      } else if (size === ImageSize.preview || size === ImageSize.original) {
        // IPP is configured in config.json to send the preview size instead of the original size
        subpath = '/thumbnail'
        sizeQueryParam = 'preview'
      } else {
        subpath = '/' + size
      }
    }
    const headers = { range: '' }

    // For videos, request them in 2.5MB chunks rather than the entire video
    if (asset.type === AssetType.video) {
      const range = (req.range || '').replace(/bytes=/, '').split('-')
      const start = parseInt(range[0], 10) || 0
      const end = parseInt(range[1], 10) || start + 2499999
      headers.range = `bytes=${start}-${end}`
      headerList.push('cache-control', 'content-range')
      res.setHeader('accept-ranges', 'bytes')
      res.status(206) // Partial Content
    }

    // Request data from Immich
    const url = immich.buildUrl(immich.apiUrl() + '/assets/' + encodeURIComponent(asset.id) + subpath, {
      key: asset.key,
      size: sizeQueryParam,
      password: asset.password
    })
    const data = await fetch(url, { headers })

    // Add the filename for downloaded assets
    if (size === ImageSize.original && asset.originalFileName && getConfigOption('ipp.downloadOriginalPhoto', true)) {
      res.setHeader('Content-Disposition', `attachment; filename="${asset.originalFileName}"`)
    }

    // Return the response to the client
    if (data.status >= 200 && data.status < 300) {
      // Populate the whitelisted response headers
      headerList.forEach(header => {
        const value = data.headers.get(header)
        if (value) res.setHeader(header, value)
      })
      // Return the Immich asset binary data
      await data.body?.pipeTo(
        new WritableStream({
          write (chunk) { res.write(chunk) }
        })
      )
      res.end()
    } else {
      respondToInvalidRequest(res, 404)
    }
  }

  /**
   * Render a gallery page for a given SharedLink, using EJS and lightGallery.
   *
   * @param res - ExpressJS Response
   * @param share - Immich `shared-link` containing the assets to show in the gallery
   * @param [openItem] - Immediately open a lightbox to the Nth item when the gallery loads
   */
  async gallery (res: Response, share: SharedLink, openItem?: number) {
    const items = []

    // Originally I had the base URL as a config option in .env.
    // The issue with that is people who may be wanting to route in via multiple
    // public URLs. So instead we generate the base URL from the incoming request data.
    // This may cause issues with some reverse proxies, in which case just make sure
    // that you're sending the correct `host` header to IPP.
    const baseUrl = res.req.protocol + '://' + res.req.headers.host

    for (const asset of share.assets) {
      let video, downloadUrl
      if (asset.type === AssetType.video) {
        // Populate the data-video property
        video = JSON.stringify({
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
      if (getConfigOption('ipp.downloadOriginalPhoto', true)) {
        // Add a download link for the original-size image, if configured in config.json
        downloadUrl = immich.photoUrl(share.key, asset.id, ImageSize.original)
      }
      items.push({
        previewUrl: immich.photoUrl(share.key, asset.id, ImageSize.preview),
        downloadUrl,
        thumbnailUrl: baseUrl + immich.photoUrl(share.key, asset.id, ImageSize.thumbnail),
        video,
        description: asset?.exifInfo?.description ?? ''
      })
    }
    res.render('gallery', {
      items,
      openItem,
      title: this.title(share),
      path: '/share/' + share.key,
      showDownload: canDownload(share),
      showTitle: getConfigOption('ipp.showGalleryTitle', false),
      lgConfig: getConfigOption('lightGallery', {})
    })
  }

  /**
   * Attempt to get a title from the link description or the album title
   */
  title (share: SharedLink) {
    return share.description || share?.album?.albumName || 'Gallery'
  }

  /**
   * Download all assets as a zip file
   */
  async downloadAll (res: Response, share: SharedLink) {
    res.setHeader('Content-Type', 'application/zip')
    const title = this.title(share).replace(/[^\w .-]/g, '') + '.zip'
    res.setHeader('Content-Disposition', `attachment; filename="${title}"`)
    const archive = archiver('zip', { zlib: { level: 6 } })
    archive.pipe(res)
    for (const asset of share.assets) {
      const url = immich.buildUrl(immich.apiUrl() + '/assets/' + encodeURIComponent(asset.id) + '/original', {
        key: asset.key,
        password: asset.password
      })
      const data = await fetch(url)
      // Check the response for validity
      if (!data.ok) {
        console.warn(`Failed to fetch asset: ${asset.id}`)
        continue
      }
      archive.append(Buffer.from(await data.arrayBuffer()), { name: asset.originalFileName || asset.id })
    }
    await archive.finalize()
    archive.on('end', () => res.end())
  }
}

const render = new Render()

export default render
