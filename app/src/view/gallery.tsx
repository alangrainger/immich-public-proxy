import { AssetType, jsonForInlineScript, ThemeScript } from '@ipp/core'
import { GalleryItem, LightboxConfig, MetadataConfig, GroupByDateMode } from '../shared/types'
import { ASSET_VERSION } from '../version'

export type { GalleryItem, LightboxConfig, MetadataConfig, GroupByDateMode }

export interface GalleryProps {
  items: GalleryItem[]
  title: string
  description: string
  publicBaseUrl: string
  path: string
  showDownloadZip: boolean
  showTitle: boolean
  // Formatted "available until" date shown in the subtitle, or undefined when
  // ipp.gallery.showExpiryDate is off or the share never expires.
  expiryDate?: string
  openItem?: number
  ogImageItem?: GalleryItem
  lightboxConfig: LightboxConfig
  metadataConfig: MetadataConfig
  groupByDate: GroupByDateMode | false
  metaBase?: string
  // The upload service's page for this share, when it accepts uploads
  uploadLink?: string
}

export function Gallery (props: GalleryProps) {
  const initJson = jsonForInlineScript({
    items: props.items,
    openItem: props.openItem,
    lightboxConfig: props.lightboxConfig,
    metadataConfig: props.metadataConfig,
    groupByDate: props.groupByDate,
    metaBase: props.metaBase
  })
  const firstItem = props.items[0]
  // og:image prefers the album cover (passed via props); for videos, previewUrl
  // points to the .mp4, so use thumbnailUrl to keep og:image a still JPEG.
  const ogItem = props.ogImageItem || firstItem
  const ogImageAsset = ogItem
    ? (ogItem.type === AssetType.video ? ogItem.thumbnailUrl : ogItem.previewUrl)
    : ''
  const ogImageUrl = ogItem ? props.publicBaseUrl + ogImageAsset : ''
  // The title block also carries the subtitle (item count + optional expiry),
  // so it renders when a title is wanted OR there's an expiry date to show.
  const showHeaderText = props.showTitle || !!props.expiryDate

  return (
    <html lang="en">
      <head>
        <ThemeScript/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>{props.title}</title>
        <meta property="og:title" content={props.title}/>
        <meta name="twitter:title" content={props.title}/>
        {props.description && <>
          <meta name="description" content={props.description}/>
          <meta property="og:description" content={props.description}/>
          <meta property="twitter:description" content={props.description}/>
        </>}
        {firstItem && <>
          <meta property="og:image" content={ogImageUrl}/>
          <meta name="twitter:image" content={ogImageUrl}/>
          <meta name="twitter:card" content="summary_large_image"/>
        </>}
        <link rel="icon" href="/share/static/favicon.ico" type="image/x-icon"/>
        <link type="text/css" rel="stylesheet" href={`/share/static/${ASSET_VERSION}/theme.css`}/>
        <link type="text/css" rel="stylesheet" href={`/share/static/${ASSET_VERSION}/style.css`}/>
        <link type="text/css" rel="stylesheet" href="/share/static/photoswipe/photoswipe.css"/>
        <link type="text/css" rel="stylesheet" href={`/share/static/${ASSET_VERSION}/photoswipe-overrides.css`}/>
      </head>
      <body>
        {(showHeaderText || props.showDownloadZip || props.uploadLink) && (
          <header id="header">
            {showHeaderText && (
              <div class="header-text">
                {props.showTitle && <h1>{props.title || 'Gallery'}</h1>}
                <p class="subtitle">
                  {props.items.length}{' '}
                  {props.items.length === 1 ? 'item' : 'items'}
                  {props.expiryDate && (
                    <>{' · available until '}{props.expiryDate}</>
                  )}
                </p>
              </div>
            )}
            <div class="header-actions">
              {props.uploadLink && (
                <a id="upload-link" class="header-action" href={props.uploadLink} title="Add photos" aria-label="Add photos">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" d="M7 19L12 14L13.88 15.88C13.33 16.79 13 17.86 13 19H7M10 10.5C10 9.67 9.33 9 8.5 9S7 9.67 7 10.5 7.67 12 8.5 12 10 11.33 10 10.5M13.09 20H6V4H13V9H18V13.09C18.33 13.04 18.66 13 19 13C19.34 13 19.67 13.04 20 13.09V8L14 2H6C4.89 2 4 2.9 4 4V20C4 21.11 4.89 22 6 22H13.81C13.46 21.39 13.21 20.72 13.09 20M18 15V18H15V20H18V23H20V20H23V18H20V15H18Z"/>
                  </svg>
                </a>
              )}
              {props.showDownloadZip && (
                <a id="download-all" class="header-action" href={props.path + '/download'} title="Download all" aria-label="Download all">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
                  </svg>
                </a>
              )}
            </div>
          </header>
        )}
        {props.description && (
          <p id="album-description">{props.description}</p>
        )}
{/* Container is intentionally empty - web.js's virtualisation manager
            populates it with only the tiles within the viewport buffer. */}
        <div id="gallery"></div>
        {props.showDownloadZip && (
          <div id="select-toolbar" hidden>
            <button id="select-cancel" class="toolbar-btn" type="button" aria-label="Exit selection mode">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
              </svg>
            </button>
            <span id="select-count">0 selected</span>
            <button id="select-all" class="toolbar-btn-text" type="button">Select all</button>
            <button id="select-download" class="toolbar-btn" type="button" aria-label="Download selected">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
              </svg>
            </button>
          </div>
        )}
        {/* Init params for web.js (read at module load). Using a JSON script
            block avoids the cross-script-type coordination problems that come
            with mixing classic and module scripts. */}
        <script
          type="application/json"
          id="ipp-init"
          dangerouslySetInnerHTML={{ __html: initJson }}
        />
        <script type="module" src={`/share/static/${ASSET_VERSION}/js/client/init.js`}></script>
      </body>
    </html>
  )
}
