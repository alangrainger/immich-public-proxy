import { jsonForInlineScript, ThemeScript } from '@ipp/core'
import { UPLOAD_ACCEPT, UploadPageConfig } from '../shared/upload'
import { ASSET_VERSION } from '../version'

export interface UploadPageProps {
  config: UploadPageConfig
  /** Path prefix the app is mounted under, without a trailing slash. Empty at the root. */
  basePath: string
  /** This share's gallery on IPP, when `GALLERY_URL` is set. */
  galleryLink?: string
}

/** The upload page for one share: the share title, the picker, and the list the client fills. */
export function UploadPage ({ config, basePath, galleryLink }: UploadPageProps) {
  const staticPath = `${basePath}/share/static/${ASSET_VERSION}`
  return (
    <html lang="en">
      <head>
        <ThemeScript/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <meta name="robots" content="noindex"/>
        <title>{'Send photos to ' + config.title}</title>
        <link rel="icon" href={basePath + '/share/static/favicon.ico'} type="image/x-icon"/>
        <link type="text/css" rel="stylesheet" href={staticPath + '/pico.min.css'}/>
        <link type="text/css" rel="stylesheet" href={staticPath + '/theme.css'}/>
        <link type="text/css" rel="stylesheet" href={staticPath + '/style.css'}/>
      </head>
      <body>
        <main class="container upload-page">
          <h1>Send photos to <em>{config.title}</em></h1>
          <button id="upload-choose" type="button" class="upload-choose">Choose photos</button>
          <input id="upload-input" type="file" multiple accept={UPLOAD_ACCEPT} hidden/>
          {galleryLink && <p><a class="upload-back" href={galleryLink}>Back to gallery</a></p>}
          <section id="upload-batch" hidden aria-live="polite">
            <h2 id="upload-status"></h2>
            <ul id="upload-list"></ul>
          </section>
        </main>
        <div id="upload-drop" hidden>
          <p>Drop to send photos to <em>{config.title}</em></p>
        </div>
        <script type="application/json" id="upload-init" dangerouslySetInnerHTML={{ __html: jsonForInlineScript(config) }}/>
        <script type="module" src={staticPath + '/js/client/upload.js'}></script>
      </body>
    </html>
  )
}
