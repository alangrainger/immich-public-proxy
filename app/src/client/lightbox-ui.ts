// PhotoSwipe UI element registrations: back button, caption (description),
// download button, fullscreen toggle, motion photo toggle. Each is gated by
// config or feature detection. The info sidebar lives in `sidebar.ts`.

import { state } from './state.js'
import {
  ICON_BACK,
  ICON_DOWNLOAD,
  ICON_FULLSCREEN,
  ICON_FULLSCREEN_EXIT,
  ICON_MOTION_PAUSE,
  ICON_MOTION_PLAY
} from './icons.js'

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
  // A slide's `container` is its `.pswp__zoom-wrap` element.
  currSlide?: { container?: HTMLElement }
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

// Set on the zoom wrap while a motion photo's clip is painting, so CSS can
// fade the still out underneath it.
const MOTION_PLAYING_CLASS = 'pswp--motion-playing'

/**
 * The `.pswp__zoom-wrap` of the slide currently on screen. Mounting the clip
 * inside it is what makes pan / zoom free: that element carries PhotoSwipe's
 * transform, so an `inset: 0` child stays pinned to the photo without any
 * geometry tracking of our own.
 */
function currentZoomWrap (pswp: PswpInstance): HTMLElement | null {
  const container = pswp.currSlide?.container
  if (container instanceof HTMLElement) return container
  // Fallback for PhotoSwipe builds that don't expose the slide off `pswp`.
  const fallback = pswp.element.querySelector('.pswp__item[aria-hidden="false"] .pswp__zoom-wrap')
  return fallback instanceof HTMLElement ? fallback : null
}

/**
 * Register the motion photo (Live Photo) toggle: swaps the still for its short
 * clip and returns to the still when the clip ends. The button hides itself on
 * slides with no clip, and the server omits `motionUrl` altogether when
 * `ipp.motionPhotos` is off, so it then never appears at all.
 *
 * The `<video>` is created on demand with `preload="none"`: nothing is fetched
 * from Immich until a visitor actually presses the button.
 */
export function registerMotionButton (lightbox: LightboxInstance) {
  lightbox.on('uiRegister', () => {
    lightbox.pswp.ui.registerElement({
      name: 'motion-button',
      order: 6,
      isButton: true,
      html: ICON_MOTION_PLAY,
      onInit: (el: HTMLElement, pswp: PswpInstance) => {
        let video: HTMLVideoElement | null = null

        const update = () => {
          el.hidden = !state.items[pswp.currIndex]?.motionUrl
          const label = video ? 'Stop motion photo' : 'Play motion photo'
          el.innerHTML = video ? ICON_MOTION_PAUSE : ICON_MOTION_PLAY
          el.setAttribute('aria-label', label)
          el.setAttribute('title', label)
        }

        // PhotoSwipe reuses slide DOM, so the clip has to be torn down on slide
        // change too, not only when it reaches its end.
        const stop = () => {
          const clip = video
          if (!clip) return
          video = null
          clip.pause()
          clip.parentElement?.classList.remove(MOTION_PLAYING_CLASS)
          clip.remove()
          update()
        }

        const play = () => {
          const item = state.items[pswp.currIndex]
          const wrap = currentZoomWrap(pswp)
          if (!item?.motionUrl || !wrap) return
          const clip = document.createElement('video')
          clip.className = 'pswp__motion-video'
          // Muted is not optional - browsers refuse programmatic playback of
          // audible media, and Immich's motion clips are silent regardless.
          clip.muted = true
          clip.playsInline = true
          clip.preload = 'none'
          clip.src = item.motionUrl
          clip.addEventListener('ended', stop, { once: true })
          // Hide the still only once the clip is actually painting, so a slow
          // clip never leaves the slide blank. The identity check keeps a late
          // event from a clip we already stopped from hiding the still for good.
          clip.addEventListener('playing', () => {
            if (video === clip) wrap.classList.add(MOTION_PLAYING_CLASS)
          }, { once: true })
          wrap.appendChild(clip)
          video = clip
          update()
          clip.play().catch(() => stop())
        }

        el.addEventListener('click', () => {
          if (video) stop()
          else play()
        })
        pswp.on('change', () => {
          stop()
          update()
        })
        pswp.on('destroy', stop)
        update()
      }
    })
  })
}
