import { Asset, SharedLink } from '../types'
import { AssetMetadata } from '../shared/types'
import { getConfigOption } from '../config/access'
import { pickExif } from './exif'
import { downloadFilename } from './filename'

/**
 * Build the on-demand metadata payload for a single asset, served by the
 * `/meta/` route when a lazy album item opens in the lightbox.
 *
 * This is the lazy-flow counterpart to the per-item baking the gallery
 * builder does eagerly for individual shares: it applies the same
 * `showMetadata` kill-switch and `ipp.showMetadata.*` gating, so the client
 * never receives anything the operator hasn't opted into.
 */
export function buildAssetMetadata (asset: Asset, share: SharedLink): AssetMetadata {
  // The share owner's "Show metadata" toggle is a kill-switch over the
  // operator's own config - mirrors gallery/builder.ts.
  const shareMetadataAllowed = share.showMetadata !== false
  const descriptionInCaption = shareMetadataAllowed && !!getConfigOption('ipp.showMetadata.description.caption', false)
  const descriptionInSidebar = shareMetadataAllowed && !!getConfigOption('ipp.showMetadata.description.sidebar', false)
  const descriptionEnabled = descriptionInCaption || descriptionInSidebar

  const description = descriptionEnabled && typeof asset?.exifInfo?.description === 'string'
    ? asset.exifInfo.description
    : undefined

  return {
    exif: shareMetadataAllowed ? pickExif(asset) : undefined,
    description,
    downloadFilename: downloadFilename(asset)
  }
}
