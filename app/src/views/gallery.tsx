import { AssetType } from '../types'
import { ThemeScript } from './_theme'

export interface GalleryItem {
  id: string
  type: AssetType
  previewUrl: string
  thumbnailUrl: string
  downloadUrl?: string
  // pre-stringified JSON describing the video source (used to build a <video>
  // element for video slides in the PhotoSwipe lightbox)
  videoData?: string
  // already-escaped HTML fragment used as a caption in the lightbox
  description?: string
  downloadFilename: string
  // Display dimensions after EXIF orientation correction; needed for the
  // pre-computed justified-rows layout that virtualization depends on.
  width?: number
  height?: number
  // Base64-encoded thumbhash for an optional blur placeholder behind each tile
  thumbhash?: string
  // ISO date string from Immich; used to group tiles by month when enabled.
  fileCreatedAt?: string
}

export interface LightboxConfig {
  showArrows: boolean
  showDownload: boolean
  mobileArrows: boolean
}

export interface GalleryProps {
  items: GalleryItem[]
  title: string
  description: string
  publicBaseUrl: string
  path: string
  showDownload: boolean
  showTitle: boolean
  openItem?: number
  lightboxConfig: LightboxConfig
  groupByDate: boolean
}

export function Gallery (props: GalleryProps) {
  const initJson = JSON.stringify({
    items: props.items,
    openItem: props.openItem,
    lightboxConfig: props.lightboxConfig,
    groupByDate: props.groupByDate
  })
  const firstItem = props.items[0]
  const ogImageUrl = firstItem ? props.publicBaseUrl + firstItem.previewUrl : ''

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
        <link type="text/css" rel="stylesheet" href="/share/static/style.css"/>
        <link type="text/css" rel="stylesheet" href="/share/static/photoswipe/photoswipe.css"/>
        <link type="text/css" rel="stylesheet" href="/share/static/photoswipe-overrides.css"/>
      </head>
      <body>
        {(props.showTitle || props.showDownload) && (
          <header id="header">
            {props.showTitle && (
              <div class="header-text">
                <h1>{props.title || 'Gallery'}</h1>
                <p class="subtitle">
                  {props.items.length}{' '}
                  {props.items.length === 1 ? 'item' : 'items'}
                </p>
              </div>
            )}
            {props.showDownload && (
              <a id="download-all" href={props.path + '/download'} title="Download all" aria-label="Download all">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
                </svg>
              </a>
            )}
          </header>
        )}
        {props.description && (
          <p id="album-description">{props.description}</p>
        )}
{/* Container is intentionally empty - web.js's virtualization manager
            populates it with only the tiles within the viewport buffer. */}
        <div id="gallery"></div>
        {props.showDownload && (
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
        <script type="module" src="/share/static/web.js"></script>
      </body>
    </html>
  )
}
