import {
  getVideoContentType,
  photoUrl,
  videoUrl
} from '../immich'
import { Response } from 'express-serve-static-core'
import { AssetType, ImageSize, SharedLink } from '../types'
import { getConfigOption, getNumericConfigOption } from '../config/access'
import { canDownload, expiryDate, title } from '../share'
import { toString } from '../utils/text'
import { h } from 'preact'
import { renderPage } from '../view/render'
import { Gallery, GalleryItem, GalleryProps } from '../view/gallery'
import type { GroupByDateMode } from '../shared/types'
import { downloadFilename } from './filename'
import { requiresOriginal } from './sizing'
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
  // (overrides any album.order the upstream applied). Sort by the same local
  // timestamp the grouping buckets on, so buckets stay contiguous / ordered.
  const groupByDate = groupByDateMode()
  if (groupByDate) {
    const sortKey = (a: typeof share.assets[number]) => a.localDateTime || a.fileCreatedAt || ''
    share.assets.sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
  }

  // Metadata display flags. Read once here and forwarded to the client via
  // `metadataConfig` in the init JSON.
  // The share owner's "Show metadata" toggle in Immich is a kill-switch over
  // the operator's own config: when explicitly `false`, no EXIF / location /
  // description fields are surfaced, regardless of `ipp.showMetadata.*`
  const shareMetadataAllowed = share.showMetadata !== false
  // Offer a zoom upgrade only when the operator opted in AND Immich would serve
  // it: web `fullsize` resolves to `/original`, which Immich refuses unless the
  // share's own download toggle (`share.allowDownload`) is on. Deliberately
  // independent of IPP's `allowDownload` config.
  const zoomUpgrade = getConfigOption('ipp.maxZoomQuality', 'preview') === 'fullsize' && share.allowDownload !== false
  const descriptionInCaption = shareMetadataAllowed && !!getConfigOption('ipp.showMetadata.description.caption', false)
  const descriptionInSidebar = shareMetadataAllowed && !!getConfigOption('ipp.showMetadata.description.sidebar', false)
  const sidebarHasContent = shareMetadataAllowed && (descriptionInSidebar || metadataGroupActive('exif') || metadataGroupActive('location'))

  const items: GalleryItem[] = await Promise.all(share.assets.map(async (asset): Promise<GalleryItem> => {
    let videoData: string | undefined
    if (asset.type === AssetType.video) {
      const source: { src: string, type?: string } = { src: videoUrl(share.key, asset.id) }
      // Album "grid" videos defer the content-type probe (one upstream call
      // per video) - a <source> with no type lets the browser fall back to
      // the proxy's response Content-Type, keeping grid render O(buckets).
      if (!asset.needsDetail) source.type = await getVideoContentType(asset)
      videoData = JSON.stringify({
        source: [source],
        attributes: {
          playsinline: 'playsinline',
          controls: 'controls'
        }
      })
    }

    const downloadUrl = photoUrl(share.key, asset.id, ImageSize.original)
    const thumbnailUrl = photoUrl(share.key, asset.id, ImageSize.thumbnail)
    // Always request `preview`; the resolver floors gif/video up to the
    // original on its own (their preview is a static frame).
    const previewUrl = photoUrl(share.key, asset.id, ImageSize.preview)
    // Still images only - gif/video are already served at their highest tier.
    const fullUrl = zoomUpgrade && asset.type === AssetType.image && !requiresOriginal(asset)
      ? photoUrl(share.key, asset.id, ImageSize.fullsize)
      : undefined
    // Plain text; the client uses textContent so no escaping needed here.
    // Description is included if EITHER surface (caption or sidebar) wants it.
    const descriptionEnabled = descriptionInCaption || descriptionInSidebar
    const itemDescription = descriptionEnabled && typeof asset?.exifInfo?.description === 'string'
      ? asset.exifInfo.description
      : ''

    let width = asset.width
    let height = asset.height
    if (!width || !height) {
      width = asset.exifInfo?.exifImageWidth
      height = asset.exifInfo?.exifImageHeight
      const orientation = asset.exifInfo?.orientation
      if (orientation && ['5', '6', '7', '8'].includes(orientation) && width && height) {
        [width, height] = [height, width]
      }
    }

    return {
      id: asset.id,
      type: asset.type,
      previewUrl,
      fullUrl,
      thumbnailUrl,
      downloadUrl,
      videoData,
      description: itemDescription || undefined,
      downloadFilename: downloadFilename(asset),
      width,
      height,
      thumbhash: asset.thumbhash,
      fileCreatedAt: asset.fileCreatedAt,
      localDateTime: asset.localDateTime,
      exif: shareMetadataAllowed ? pickExif(asset) : undefined,
      // Album grid items carry no exif / description / real filename yet; the
      // client fetches them from `metaBase` the first time the item opens.
      needsDetail: asset.needsDetail || undefined
    }
  }))

  // Album shares contain lazy items; expose the on-demand metadata route so
  // the client can fetch per-asset detail on lightbox open. Individual shares
  // bake everything in, so no metaBase is needed there.
  const metaBase = items.some(item => item.needsDetail) ? '/share/meta/' + share.key : undefined

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
    showDownloadZip: downloadAllowed && !!getConfigOption('ipp.gallery.showDownloadZip', true),
    showTitle: !!getConfigOption('ipp.gallery.showTitle', true),
    expiryDate: expiryDate(share),
    openItem,
    ogImageItem,
    lightboxConfig: {
      // Show download button only if downloading is allowed AND configured.
      showDownload: downloadAllowed && !!getConfigOption('ipp.lightbox.showDownload', true),
      showArrows: !!getConfigOption('ipp.lightbox.showArrows', true),
      mobileArrows: !!getConfigOption('ipp.lightbox.mobileArrows', false),
      autoPlayVideos: !!getConfigOption('ipp.lightbox.autoPlayVideos', false),
      options: lightboxOptions
    },
    metadataConfig: {
      descriptionInCaption,
      descriptionInSidebar,
      sidebarHasContent,
      locationWebLink: !!getConfigOption('ipp.showMetadata.location.webLink', true)
    },
    groupByDate,
    metaBase
  }

  // HTML gallery page cache time
  const cacheTime = Math.max(0, getNumericConfigOption('ipp.gallery.cacheTime', 300))
  res.header('Cache-Control', 'public, max-age=' + cacheTime)
  res.send(renderPage(h(Gallery, props)))
}

/**
 * Get the Immich shared link description (album-level, not per-asset).
 */
function description (share: SharedLink) {
  return share?.album?.description || ''
}

/**
 * Normalise the operator's `ipp.gallery.groupByDate` config into a grouping
 * mode. Accepts `false` (off), `true` / `'month'` (legacy = month buckets) or
 * `'day'` (day buckets); anything else is treated as off.
 */
function groupByDateMode (): GroupByDateMode | false {
  const v = getConfigOption('ipp.gallery.groupByDate', false)
  if (v === 'day') return 'day'
  if (v === true || v === 'month') return 'month'
  return false
}
