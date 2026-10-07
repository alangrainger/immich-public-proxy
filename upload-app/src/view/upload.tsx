import { jsonForInlineScript, ThemeScript } from '@ipp/core'
import { ICON_ARROW_LEFT, ICON_CLOUD_UPLOAD } from '../shared/icons'
import { UPLOAD_ACCEPT, UploadPageConfig } from '../shared/upload'
import { ASSET_VERSION } from '../version'

export interface UploadPageProps {
  config: UploadPageConfig
  /** Path prefix the app is mounted under, without a trailing slash. Empty at the root. */
  basePath: string
  /** This share's gallery on IPP, when `PUBLIC_BASE_URL` is set. */
  galleryLink?: string
}

function Icon ({ path, class: className }: { path: string, class?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" class={className}>
      <path fill="currentColor" d={path}/>
    </svg>
  )
}

/**
 * The upload page for one share, in the look of Immich's own upload UI: the
 * gallery's header, a placeholder to click or drop on, and an upload panel
 * the client fills.
 */
export function UploadPage ({ config, basePath, galleryLink }: UploadPageProps) {
  const staticPath = `${basePath}/share/static/${ASSET_VERSION}`
  return (
    <html lang="en">
      <head>
        <ThemeScript/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <meta name="robots" content="noindex"/>
        <title>{'Add photos to ' + config.title}</title>
        <link rel="icon" href={basePath + '/share/static/favicon.ico'} type="image/x-icon"/>
        <link type="text/css" rel="stylesheet" href={staticPath + '/theme.css'}/>
        <link type="text/css" rel="stylesheet" href={staticPath + '/style.css'}/>
      </head>
      <body>
        <header id="header">
          {galleryLink && (
            <a class="header-action" href={galleryLink} title="Back to gallery" aria-label="Back to gallery">
              <Icon path={ICON_ARROW_LEFT}/>
            </a>
          )}
          <div class="header-text">
            <h1>{config.title}</h1>
            <p class="subtitle">Add photos and videos</p>
          </div>
        </header>
        <main id="upload-main">
          <button id="upload-choose" type="button" class="upload-placeholder">
            <Icon path={ICON_CLOUD_UPLOAD} class="upload-placeholder-icon"/>
            <span class="upload-placeholder-title">Add photos</span>
            <span class="upload-placeholder-text">Choose photos and videos<span class="upload-drop-hint">, or drop them here</span></span>
          </button>
          <input id="upload-input" type="file" multiple accept={UPLOAD_ACCEPT} hidden/>
          <section id="upload-panel" hidden aria-live="polite" aria-label="Uploads">
            <p id="upload-progress"></p>
            <p id="upload-counts"></p>
            <p id="upload-note" hidden>New photos appear in the gallery once Immich has processed them.</p>
            <ul id="upload-list"></ul>
          </section>
        </main>
        <div id="upload-drop" hidden>
          <Icon path={ICON_CLOUD_UPLOAD} class="upload-drop-icon"/>
          <p>Drop files to upload</p>
        </div>
        <script type="application/json" id="upload-init" dangerouslySetInnerHTML={{ __html: jsonForInlineScript(config) }}/>
        <script type="module" src={staticPath + '/js/client/upload.js'}></script>
      </body>
    </html>
  )
}
