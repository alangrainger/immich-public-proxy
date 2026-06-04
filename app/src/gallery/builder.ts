import {
  getPreviewImageSize,
  getVideoContentType,
  photoUrl,
  requiresOriginal,
  videoUrl
} from '../immich'
import { Response } from 'express-serve-static-core'
import { AssetType, ImageSize, SharedLink } from '../types'
import { getConfigOption } from '../config/access'
import { canDownload, title } from '../share'
import { toString } from '../utils/text'
import { h } from 'preact'
import { renderPage } from '../view/render'
import { Gallery, GalleryItem, GalleryProps } from '../view/gallery'
import { getFilename } from './filename'
import { metadataGroupActive, pickExif } from './exif'

/**
 * Render a gallery page for a given SharedLink.
 *
 * @param res - ExpressJS Response
 * @param share - Immich `shared-link` containing the assets to show in the gallery
 * @param [openItem] - Immediately open the lightbox to the Nth item when the gallery loads
 */
export async function gallery (res: Response, share: SharedLink, openItem?: number) {
  // publicBaseUrl is used for the og:image, which requires a fully qualified URL.
  // You can specify this in your docker-compose file via the PUBLIC_BASE_URL env var.
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || (res.req.protocol + '://' + res.req.headers.host)

  // Date grouping needs chronological order; sort newest-first when enabled
  // (overrides any album.order the upstream applied).
  const groupByDate = !!getConfigOption('ipp.gallery.groupByDate', false)
  if (groupByDate) {
    share.assets.sort((a, b) => (b.fileCreatedAt || '').localeCompare(a.fileCreatedAt || ''))
  }

  // Metadata display flags. Read once here and forwarded to the client via
  // `metadataConfig` in the init JSON.
  const descriptionInCaption = !!getConfigOption('ipp.showMetadata.description.caption', false)
  const descriptionInSidebar = !!getConfigOption('ipp.showMetadata.description.sidebar', false)
  const sidebarHasContent = descriptionInSidebar || metadataGroupActive('exif') || metadataGroupActive('location')

  // Build structured items in parallel
  const items: GalleryItem[] = await Promise.all(share.assets.map(async (asset): Promise<GalleryItem> => {
    let videoData: string | undefined
    if (asset.type === AssetType.video) {
      videoData = JSON.stringify({
        source: [
          {
            src: videoUrl(share.key, asset.id),
            type: await getVideoContentType(asset)
          }
        ],
        attributes: {
          playsinline: 'playsinline',
          controls: 'controls'
        }
      })
    }

    // Compute the filename so the client-side `<a download="...">` attribute
    // matches the bytes the server will return. Without this, a HEIC
    // original served as a preview JPEG would download as "photo.heic"
    // with JPEG bytes inside.
    const downloadUrl = photoUrl(share.key, asset.id, ImageSize.original)
    const downloadServedSize = (getConfigOption('ipp.downloadOriginalPhoto', true) || requiresOriginal(asset))
      ? ImageSize.original
      : ImageSize.preview

    const thumbnailUrl = photoUrl(share.key, asset.id, ImageSize.thumbnail)
    const previewUrl = photoUrl(share.key, asset.id, getPreviewImageSize(asset))
    // Plain text; the client uses textContent so no escaping needed here.
    // Description is included if EITHER surface (caption or sidebar) wants it.
    const descriptionEnabled = descriptionInCaption || descriptionInSidebar
    const itemDescription = descriptionEnabled && typeof asset?.exifInfo?.description === 'string'
      ? asset.exifInfo.description
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
      description: itemDescription || undefined,
      downloadFilename: getFilename(asset, downloadServedSize),
      width,
      height,
      thumbhash: asset.thumbhash,
      fileCreatedAt: asset.fileCreatedAt,
      exif: pickExif(asset)
    }
  }))

  const downloadAllowed = canDownload(share)
  // Prefer the album's owner-chosen cover for og:image; fall back to first
  // item if the cover asset has been filtered out (e.g. trashed).
  const coverId = share.album?.albumThumbnailAssetId
  const ogImageItem = (coverId && items.find(i => i.id === coverId)) || items[0]
  // Guard against an operator setting ipp.lightbox.options to a non-object;
  // a string would otherwise spread character-by-character into PhotoSwipe.
  const rawLightboxOptions = getConfigOption('ipp.lightbox.options', {})
  const lightboxOptions: Record<string, unknown> = (rawLightboxOptions && typeof rawLightboxOptions === 'object' && !Array.isArray(rawLightboxOptions))
    ? rawLightboxOptions as Record<string, unknown>
    : {}
  const props: GalleryProps = {
    items,
    title: title(share),
    description: getConfigOption('ipp.gallery.showDescription', false) ? description(share) : '',
    publicBaseUrl: toString(publicBaseUrl),
    path: '/share/' + share.key,
    showDownload: downloadAllowed,
    showTitle: !!getConfigOption('ipp.gallery.showTitle', true),
    openItem,
    ogImageItem,
    lightboxConfig: {
      // Show download button only if downloading is allowed AND configured.
      showDownload: downloadAllowed && !!getConfigOption('ipp.lightbox.showDownload', true),
      showArrows: !!getConfigOption('ipp.lightbox.showArrows', true),
      mobileArrows: !!getConfigOption('ipp.lightbox.mobileArrows', false),
      options: lightboxOptions
    },
    metadataConfig: {
      descriptionInCaption,
      descriptionInSidebar,
      sidebarHasContent
    },
    groupByDate
  }

  res.send(renderPage(h(Gallery, props)))
}

/**
 * Get the Immich shared link description (album-level, not per-asset).
 */
function description (share: SharedLink) {
  return share?.album?.description || ''
}
