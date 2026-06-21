// PhotoSwipe UI element registrations: back button, caption (description),
// download button, fullscreen toggle. Each is gated by config or feature
// detection. The info sidebar lives in `sidebar.ts`.

import { state } from './state.js'
import { ICON_BACK, ICON_DOWNLOAD, ICON_FULLSCREEN, ICON_FULLSCREEN_EXIT } from './icons.js'

// PhotoSwipe types are not bundled with the project. These two interfaces
// describe just enough of the surface we touch to keep the rest of the file
// type-checked.
interface PswpUiElementConfig {
  name: string
  order: number
  isButton: boolean
  tagName?: string
  ariaLabel?: string
  appendTo?: string
  html?: string
  // eslint-disable-next-line no-use-before-define
  onInit?: (el: HTMLElement, pswp: PswpInstance) => void
}

interface PswpInstance {
  currIndex: number
  element: HTMLElement
  ui: {
    registerElement: (config: PswpUiElementConfig) => void
  }
  on: (event: string, cb: () => void) => void
  close: () => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LightboxInstance = any

/**
 * Register the top-left back button that closes the lightbox and returns
 * to the gallery grid. Matches Immich's native asset-viewer affordance
 * (back arrow, no top-right X). Order 1 puts it at the leftmost slot of
 * the toolbar. The default PhotoSwipe close button is hidden via CSS in
 * `photoswipe-overrides.css`.
 */
export function registerBackButton (lightbox: LightboxInstance) {
  lightbox.on('uiRegister', () => {
    lightbox.pswp.ui.registerElement({
      name: 'back-button',
      order: 1,
      isButton: true,
      ariaLabel: 'Back to gallery',
      html: ICON_BACK,
      onInit: (el: HTMLElement, pswp: PswpInstance) => {
        el.addEventListener('click', () => pswp.close())
      }
    })
  })
}

/**
 * Register the description-caption UI element. Content is plain text from
 * the server; the client uses `textContent` so any HTML-significant
 * characters in the description render as literal text (not markup).
 *
 * Caller is responsible for only invoking this when
 * `metadataConfig.descriptionInCaption` is true.
 */
export function registerCaption (lightbox: LightboxInstance) {
  lightbox.on('uiRegister', () => {
    lightbox.pswp.ui.registerElement({
      name: 'caption',
      order: 9,
      isButton: false,
      appendTo: 'root',
      onInit: (el: HTMLElement, pswp: PswpInstance) => {
        el.classList.add('pswp__caption')
        const render = () => {
          const item = state.items[pswp.currIndex]
          const text = (item && item.description) || ''
          el.textContent = text
          el.hidden = !text
        }
        render()
        pswp.on('change', render)
        // Re-render when a lazy album item's description arrives after open.
        state.slideRefreshers.push(render)
      }
    })
  })
}

/**
 * Register the download button. Only called when the share allows downloads
 * AND the config enables the lightbox button.
 */
export function registerDownloadButton (lightbox: LightboxInstance) {
  lightbox.on('uiRegister', () => {
    lightbox.pswp.ui.registerElement({
      name: 'download-button',
      order: 8,
      isButton: true,
      tagName: 'a',
      ariaLabel: 'Download',
      html: ICON_DOWNLOAD,
      onInit: (el: HTMLElement, pswp: PswpInstance) => {
        const link = el as HTMLAnchorElement
        link.setAttribute('target', '_blank')
        link.setAttribute('rel', 'noopener')
        const update = () => {
          const item = state.items[pswp.currIndex]
          if (item && item.downloadUrl) {
            link.href = item.downloadUrl
            link.setAttribute('download', item.downloadFilename || '')
          } else {
            link.removeAttribute('href')
          }
        }
        update()
        pswp.on('change', update)
        // Refresh the href/filename when a lazy album item's real download
        // filename arrives after open.
        state.slideRefreshers.push(update)
      }
    })
  })
}

/**
 * Register the fullscreen toggle. Skipped on browsers without Fullscreen API
 * support for arbitrary elements (notably iOS Safari on iPhone).
 */
export function registerFullscreenButton (lightbox: LightboxInstance) {
  if (!document.fullscreenEnabled) return
  lightbox.on('uiRegister', () => {
    lightbox.pswp.ui.registerElement({
      name: 'fullscreen-button',
      order: 9,
      isButton: true,
      html: ICON_FULLSCREEN,
      onInit: (el: HTMLElement, pswp: PswpInstance) => {
        const update = () => {
          const active = document.fullscreenElement === pswp.element
          el.innerHTML = active ? ICON_FULLSCREEN_EXIT : ICON_FULLSCREEN
          el.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Fullscreen')
          el.setAttribute('title', active ? 'Exit fullscreen' : 'Fullscreen')
        }
        update()
        el.addEventListener('click', () => {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {})
          } else {
            pswp.element.requestFullscreen().catch(() => {})
          }
        })
        document.addEventListener('fullscreenchange', update)
        pswp.on('destroy', () => {
          document.removeEventListener('fullscreenchange', update)
          if (document.fullscreenElement === pswp.element) {
            document.exitFullscreen().catch(() => {})
          }
        })
      }
    })
  })
}
