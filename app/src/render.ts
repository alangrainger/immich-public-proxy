import immich from './immich'
import { Response } from 'express-serve-static-core'
import { Asset, AssetType, ImageSize, IncomingShareRequest, SharedLink } from './types'
import { getConfigOption } from './functions'
import archiver from 'archiver'
import { respondToInvalidRequest } from './invalidRequestHandler'
import { pipeline } from 'stream';
import { promisify } from 'util';

const pipelineAsync = promisify(pipeline);
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
      if (size === ImageSize.original && getConfigOption('ipp.downloadOriginalPhoto', true)) {
        subpath = '/original'
      } else if (size === ImageSize.preview || size === ImageSize.original) {
        subpath = '/thumbnail'
        sizeQueryParam = 'preview'
      } else {
        subpath = '/' + size
      }
    }
    const headers = { range: '' }

    // For videos, request in larger chunks (5MB) and pre-buffer multiple chunks
    if (asset.type === AssetType.video) {
      const range = (req.range || '').replace(/bytes=/, '').split('-')
      const start = parseInt(range[0], 10) || 0
      const chunkSize = 5 * 1024 * 1024 // 5MB chunks for smoother streaming
      headers.range = `bytes=${start}-${start + chunkSize - 1}`
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

    // For videos, pre-buffer multiple chunks
    if (asset.type === AssetType.video) {
      const maxRetries = 3
      const chunksToPrefetch = 3 // Pre-buffer up to 3 chunks
      let retries = 0
      let currentStart = start
      let totalSize = 0

      // Fetch the first chunk to get the total size
      const initialData = await fetch(url, { headers })
      if (initialData.status >= 200 && initialData.status < 300) {
        totalSize = parseInt(initialData.headers.get('content-length'), 10) || 0
        headerList.forEach(header => {
          const value = initialData.headers.get(header)
          if (value) res.setHeader(header, value)
        })
        await initialData.body?.pipeTo(
          new WritableStream({
            write(chunk) { res.write(chunk) }
          })
        )
      } else {
        respondToInvalidRequest(res, 404)
        return
      }

      // Pre-buffer the next chunks
      for (let i = 0; i < chunksToPrefetch - 1 && currentStart < totalSize; i++) {
        currentStart += chunkSize
        const end = Math.min(currentStart + chunkSize - 1, totalSize - 1)
        const chunkRange = `bytes=${currentStart}-${end}`
        retries = 0

        while (retries < maxRetries) {
          try {
            const chunkData = await fetch(url, { headers: { range: chunkRange } })
            if (chunkData.status >= 200 && chunkData.status < 300) {
              await chunkData.body?.pipeTo(
                new WritableStream({
                  write(chunk) { res.write(chunk) }
                })
              )
              break
            } else {
              throw new Error('Fetch failed')
            }
          } catch (err) {
            retries++
            if (retries === maxRetries) {
              console.warn(`Failed to fetch chunk for asset ${asset.id} after ${maxRetries} retries`)
              break
            }
          }
        }
      }
      res.end()
    } else {
      // Handle images as before
      const data = await fetch(url, { headers })
      if (size === ImageSize.original && asset.originalFileName && getConfigOption('ipp.downloadOriginalPhoto', true)) {
        res.setHeader('Content-Disposition', `attachment; filename="${asset.originalFileName}"`)
      }
      if (data.status >= 200 && data.status < 300) {
        headerList.forEach(header => {
          const value = data.headers.get(header)
          if (value) res.setHeader(header, value)
        })
        await data.body?.pipeTo(
          new WritableStream({
            write(chunk) { res.write(chunk) }
          })
        )
        res.end()
      } else {
        respondToInvalidRequest(res, 404)
      }
    }
  }

  /**
   * Render a gallery page for a given SharedLink, using EJS and lightGallery.
   */
  async gallery (res: Response, share: SharedLink, openItem?: number) {
    const items = []
    const baseUrl = res.req.protocol + '://' + res.req.headers.host

    for (const asset of share.assets) {
      let video, downloadUrl
      if (asset.type === AssetType.video) {
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
        downloadUrl = immich.photoUrl(share.key, asset.id, ImageSize.original)
      }
      items.push({
        previewUrl: immich.photoUrl(share.key, asset.id, ImageSize.preview),
        downloadUrl,
        thumbnailUrl: baseUrl + immich.photoUrl(share.key, asset.id, ImageSize.thumbnail),
        video
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
