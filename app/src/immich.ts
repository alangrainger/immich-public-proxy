import {
  Album,
  AlbumType,
  Asset,
  AssetType,
  ImageSize,
  IncomingShareRequest,
  SharedLink,
  SharedLinkResult
} from './types'
import dayjs from 'dayjs'
import { addResponseHeaders, canDownload, getConfigOption, log } from './functions'
import render from './render'
import { Response } from 'express-serve-static-core'
import { respondToInvalidRequest } from './invalidRequestHandler'

class Immich {
  /**
   * Make a request to Immich API. We're not using the SDK to limit
   * the possible attack surface of this app.
   */
  async request (endpoint: string) {
    try {
      const res = await fetch(this.apiUrl() + endpoint)
      if (res.status === 200) {
        const contentType = res.headers.get('Content-Type') || ''
        if (contentType.includes('application/json')) {
          return res.json()
        } else {
          return res
        }
      } else {
        log('Immich API status ' + res.status)
        console.log(await res.text())
      }
    } catch (e) {
      log('Unable to reach Immich on ' + process.env.IMMICH_URL)
      log(`From the server IPP is running on, see if you can curl to ${this.apiUrl()}/server/ping and receive a JSON result.`)
    }
  }

  apiUrl () {
    return (process.env.IMMICH_URL || '').replace(/\/*$/, '') + '/api'
  }

  /**
   * Handle an incoming request for a shared link `key`. This is the main function which
   * communicates with Immich and returns the output back to the visitor.
   *
   * Possible HTTP responses are:
   *
   * 200 - either a photo gallery or the unlock page.
   * 401 - the visitor provided a password but it was invalid.
   * 404 - any other failed request. Check console.log for details.
   */
  async handleShareRequest (request: IncomingShareRequest, res: Response) {
    addResponseHeaders(res)

    // Check that the key is a valid format
    if (!immich.isKey(request.key)) {
      log('Invalid share key ' + request.key)
      respondToInvalidRequest(res, 404)
      return
    }

    // Get information about the shared link via Immich API
    const sharedLinkRes = await immich.getShareByKey(request.key, request.password)
    if (!sharedLinkRes.valid) {
      // This isn't a valid request - check the console for more information
      respondToInvalidRequest(res, 404)
      return
    }

    // A password is required, but the visitor-provided one doesn't match
    if (sharedLinkRes.passwordRequired && request.password) {
      log('Invalid password for key ' + request.key)
      res.status(401)
      // Delete the cookie-session data, so that it doesn't keep saying "Invalid password"
      if (request.req?.session) delete request.req.session[request.key]
    }

    // Don't cache password-protected albums
    if (sharedLinkRes.passwordRequired || request.password) {
      res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      res.header('Pragma', 'no-cache')
      res.header('Expires', '0')
    }

    // Password required - show the visitor the password page
    if (sharedLinkRes.passwordRequired) {
      // `request.key` is already sanitised at this point, but it never hurts to be explicit
      const key = request.key.replace(/[^\w-]/g, '')
      res.render('password', {
        key,
        lgConfig: render.lgConfig,
        notifyInvalidPassword: !!request.password
      })
      return
    }

    if (!sharedLinkRes.link) {
      log('Unknown error with key ' + request.key)
      respondToInvalidRequest(res, 404)
      return
    }
    const link = sharedLinkRes.link

    // Make sure there are some photo/video assets for this link
    /*
    if (!link.assets.length) {
      log('No assets for key ' + request.key)
      respondToInvalidRequest(res, 404)
      return
    } */

    // Everything is ok - output the shared link data

    if (request.mode === 'download' && canDownload(link)) {
      // Download all assets as a zip file
      await render.downloadAll(res, link)
    } else if (link.assets.length === 1) {
      // This is an individual item (not a gallery)
      log('Serving link ' + request.key)
      const asset = link.assets[0]
      if (asset.type === AssetType.image && !getConfigOption('ipp.singleImageGallery') && !request.password) {
        // For photos, output the image directly unless configured to show a gallery,
        // or unless it's a password-protected link
        await render.assetBuffer(request, res, link.assets[0], ImageSize.preview)
      } else {
        // Show a gallery page
        const openItem = getConfigOption('ipp.singleItemAutoOpen', true) ? 1 : 0
        await render.gallery(res, link, openItem)
      }
    } else {
      // Multiple images - render as a gallery
      log('Serving link ' + request.key)
      await render.gallery(res, link)
    }
  }

  /**
   * Query Immich for the SharedLink metadata for a given key.
   * The key is what is returned in the URL when you create a share in Immich.
   */
  async getShareByKey (key: string, password?: string): Promise<SharedLinkResult> {
    let link
    const url = this.buildUrl(this.apiUrl() + '/shared-links/me', {
      key,
      password
    })
    const res = await fetch(url)
    if ((res.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
      const jsonBody = await res.json()
      if (jsonBody) {
        if (res.status === 200) {
          // Normal response - get the shared assets
          link = jsonBody as SharedLink

          // For an album, we need to make a second request to Immich to populate
          // the array of assets
          if (link.type === AlbumType.album) {
            const albumRes = await fetch(this.buildUrl(this.apiUrl() + '/albums/' + link?.album?.id, {
              key,
              password
            }))
            const album = await albumRes.json() as Album
            if (!album?.id) {
              log('Invalid album ID - ' + link?.album?.id)
              return {
                valid: false
              }
            }
            // Replace the empty link.assets array with the array of assets from the album
            link.assets = album.assets
          }

          link.password = password
          if (link.expiresAt && dayjs(link.expiresAt) < dayjs()) {
            // This link has expired
            log('Expired link ' + key)
          } else {
            // Filter assets to exclude trashed assets
            link.assets = link.assets.filter(asset => !asset.isTrashed)
            // Populate the shared assets with the public key/password
            link.assets.forEach(asset => {
              asset.key = key
              asset.password = password
            })
            // Sort album if there is a sort order specified
            const sortOrder = link.album?.order
            if (sortOrder === 'asc') {
              link.assets.sort((a, b) => a?.fileCreatedAt?.localeCompare(b.fileCreatedAt || '') || 0)
            } else if (sortOrder === 'desc') {
              link.assets.sort((a, b) => b?.fileCreatedAt?.localeCompare(a.fileCreatedAt || '') || 0)
            }
            return {
              valid: true,
              link
            }
          }
        } else if (res.status === 401 && jsonBody?.message === 'Invalid password') {
          // Password authentication required
          return {
            valid: true,
            passwordRequired: true
          }
        } else if (jsonBody?.message === 'Invalid share key') {
          log('Invalid share key ' + key)
        } else {
          console.log(JSON.stringify(jsonBody))
        }
      }
    } else {
      // Otherwise return failure
      log('Immich response ' + res.status + ' for key ' + key)
      try {
        console.log(res.headers.get('Content-Type'))
        console.log((await res.text()).slice(0, 500))
        log('Unexpected response from Immich API at ' + this.apiUrl())
        log('Please make sure the IPP container is able to reach this path.')
      } catch (e) {
        console.log(e)
      }
    }
    return {
      valid: false
    }
  }

  /**
   * Get the content-type of a video, for passing back to lightGallery
   */
  async getVideoContentType (asset: Asset) {
    const data = await this.request(this.buildUrl('/assets/' + encodeURIComponent(asset.id) + '/video/playback', {
      key: asset.key,
      password: asset.password
    }))
    return data.headers.get('Content-Type')
  }

  /**
   * Build safely-encoded URL string
   */
  buildUrl (baseUrl: string, params: { [key: string]: string | undefined } = {}) {
    // Remove empty properties
    params = Object.fromEntries(Object.entries(params).filter(([_, value]) => !!value))
    let query = ''
    // Safely encode query parameters
    if (Object.entries(params).length) {
      query = '?' + (new URLSearchParams(params as {
        [key: string]: string
      })).toString()
    }
    return baseUrl + query
  }

  /**
   * Return the image data URL for a photo
   */
  photoUrl (key: string, id: string, size?: ImageSize) {
    const path = ['photo', key, id]
    if (size) path.push(size)
    return this.buildUrl('/share/' + path.join('/'))
  }

  /**
   * Return the video data URL for a video
   */
  videoUrl (key: string, id: string) {
    return this.buildUrl(`/share/video/${key}/${id}`)
  }

  /**
   * Check if a provided ID matches the Immich ID format
   */
  isId (id: string) {
    return !!id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  }

  /**
   * Check if a provided key matches the Immich shared-link key format.
   * It appears that the key is always 67 chars long, but since I don't know that this
   * will always be the case, I've left it open-ended.
   */
  isKey (key: string) {
    return !!key.match(/^[\w-]+$/)
  }

  async accessible () {
    return !!(await immich.request('/server/ping'))
  }

  validateImageSize (size: unknown) {
    if (!size || !Object.values(ImageSize).includes(size as ImageSize)) {
      return ImageSize.preview
    } else {
      return size as ImageSize
    }
  }
}

const immich = new Immich()

export default immich
