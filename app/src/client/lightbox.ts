// PhotoSwipe instantiation, data-source construction, history / hash
// navigation. Individual UI elements (caption, download, fullscreen,
// sidebar) live in lightbox-ui.ts and sidebar.ts.

// Runtime URL resolved by Express static, not a TS-resolvable module path.
// @ts-expect-error - browser-only ESM URL
import PhotoSwipeLightbox from '/share/static/photoswipe/photoswipe-lightbox.esm.js' // eslint-disable-line import/no-absolute-path

import { state, SIDEBAR_WIDTH, MOBILE_BREAKPOINT } from './state.js'
import type { GalleryItem } from '../shared/types.js'
import {
  registerBackButton,
  registerCaption,
  registerDownloadButton,
  registerFullscreenButton
} from './lightbox-ui.js'
import { registerSidebar } from './sidebar.js'

/**
 * Replace the current history entry with the same URL minus any hash.
 * No-op when there is no hash. Used by the lightbox-close paths so the
 * browser bar shows a clean gallery URL after the lightbox dismisses,
 * even when the entry we land on came from a `#assetId` deep link.
 */
function clearHashIfPresent () {
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }
}

function parseVideoData (item: GalleryItem): { src: string, type: string } {
  try {
    const data = JSON.parse(item.videoData || '{}')
    const source = (data.source && data.source[0]) || {}
    return { src: source.src || '', type: source.type || 'video/mp4' }
  } catch (e) {
    return { src: '', type: 'video/mp4' }
  }
}

function escapeAttr (s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Translate `state.items` into PhotoSwipe's dataSource array. Images use
 * `src`/`width`/`height`; videos use the `html` slide with a `<video>`
 * element so PhotoSwipe streams from the server's `/share/video/...` URL.
 */
function buildDataSource () {
  return state.items.map(item => {
    if (item.type === 'VIDEO') {
      const v = parseVideoData(item)
      return {
        html:
          '<div class="pswp__video-wrap">' +
          '<video controls playsinline poster="' + escapeAttr(item.thumbnailUrl) + '" style="width: 100%; height: 100%; object-fit: contain;">' +
          '<source src="' + escapeAttr(v.src) + '" type="' + escapeAttr(v.type) + '">' +
          '</video>' +
          '</div>'
      }
    }
    return {
      src: item.previewUrl,
      width: item.width || 1600,
      height: item.height || 1200,
      msrc: item.thumbnailUrl,
      alt: item.description || ''
    }
  })
}

/**
 * Construct the PhotoSwipe lightbox, register its UI elements, set up hash
 * navigation, and call `init()`. Reads config from `state.lightboxConfig`
 * and writes the instance back to `state.lightbox`.
 *
 * Browser history is integrated so the mobile back gesture closes the
 * lightbox, and the URL hash tracks the current slide for shareable
 * deep-links.
 */
export function initLightbox () {
  const { options = {} } = state.lightboxConfig

  state.lightbox = new PhotoSwipeLightbox({
    bgOpacity: 1,
    showHideAnimationType: 'fade',
    closeOnVerticalDrag: true,
    arrowKeys: true,
    loop: false,
    // paddingFn lets the sidebar shrink the slide viewport when open. On a
    // narrow viewport the sidebar overlays instead, so we leave padding
    // alone in that case.
    paddingFn: () => ({
      top: 56,
      bottom: 56,
      left: 16,
      right: state.sidebarOpen && window.innerWidth >= MOBILE_BREAKPOINT
        ? SIDEBAR_WIDTH + 16
        : 16
    }),
    ...options,
    dataSource: buildDataSource(),
    // @ts-expect-error - runtime URL resolved by Express static
    pswpModule: () => import('/share/static/photoswipe/photoswipe.esm.js') // eslint-disable-line import/no-absolute-path
  })

  registerBackButton(state.lightbox)
  if (state.lightboxConfig.showDownload) registerDownloadButton(state.lightbox)
  registerFullscreenButton(state.lightbox)
  if (state.metadataConfig.descriptionInCaption) registerCaption(state.lightbox)
  if (state.metadataConfig.sidebarHasContent) registerSidebar(state.lightbox)

  // Hash navigation + back-button handling: push a history entry on open so
  // the mobile back gesture closes the lightbox; sync the hash with the
  // current slide as the user pages through.
  state.lightbox.on('uiRegister', () => {
    const pswp = state.lightbox.pswp
    const item = state.items[pswp.currIndex]
    if (item) {
      history.pushState({ pswp: true }, '', '#' + item.id)
      state.lightboxPushedHistory = true
    }
    pswp.on('change', () => {
      const it = state.items[pswp.currIndex]
      if (it) history.replaceState({ pswp: state.lightboxPushedHistory }, '', '#' + it.id)
    })
    pswp.on('close', () => {
      scrollToCurrentSlide(pswp.currIndex)
      const wasFromHistory = state.closingFromHistory
      state.closingFromHistory = false
      if (wasFromHistory) {
        // popstate already moved us back to the prior entry. If that entry
        // still has a hash (e.g. the user arrived via a #assetId deep link
        // and we pushed on top of it), strip it now.
        state.lightboxPushedHistory = false
        clearHashIfPresent()
      } else if (state.lightboxPushedHistory) {
        // UI close (button / Esc / swipe-down): consume our pushed entry.
        // The popstate handler below clears any leftover hash on the entry
        // we land on.
        state.closingFromHistory = true
        state.lightboxPushedHistory = false
        history.back()
      } else {
        history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    })
  })

  window.addEventListener('popstate', () => {
    if (state.closingFromHistory) {
      // Our own history.back() during a UI-driven close. The current entry
      // (which we just navigated to) may still carry a hash from a deep
      // link; strip it for a clean exit URL.
      state.closingFromHistory = false
      clearHashIfPresent()
      return
    }
    if (state.lightbox && state.lightbox.pswp && state.lightboxPushedHistory) {
      state.closingFromHistory = true
      state.lightbox.pswp.close()
    }
  })

  // Video autoplay
  let autoplayInterval: ReturnType<typeof setInterval> | null = null
  let lastAutoplayIndex = -1

  const tryAutoplay = () => {
    if (!state.lightbox.pswp || !state.lightbox.pswp.currSlide || !state.lightbox.pswp.currSlide.isActive) return
    const index = state.lightbox.pswp.currIndex
    if (index === lastAutoplayIndex) return

    const item = state.items[index]
    if (!item) return
    
    // If it's a video, wait for the DOM element to actually exist
    const video = state.lightbox.pswp.currSlide.container
      ? state.lightbox.pswp.currSlide.container.querySelector('video')
      : null
      
    if (item.type === 'VIDEO' && !video) return

    // Mark this slide as processed
    lastAutoplayIndex = index

    if (video && video.paused) {
      const playPromise = video.play()
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          video.muted = true
          video.play().catch(() => {})
        })
      }
    }
  }

  state.lightbox.on('uiRegister', () => {
    // Start polling when lightbox opens
    autoplayInterval = setInterval(tryAutoplay, 50)

    state.lightbox.pswp.on('close', () => {
      if (autoplayInterval) clearInterval(autoplayInterval)
      lastAutoplayIndex = -1
    })
  })

  // We still use contentDeactivate to immediately pause videos when sliding away
  state.lightbox.on('contentDeactivate', ({ content }: any) => {
    const video = content && content.element && content.element.querySelector
      ? content.element.querySelector('video')
      : null
    if (video) { video.pause(); video.currentTime = 0 }
  })

  // Optional control hiding (defaults match Immich's behavior)
  const docEl = document.documentElement
  if (!state.lightboxConfig.showArrows) docEl.classList.add('pswp-no-arrows')
  if (!state.lightboxConfig.mobileArrows) docEl.classList.add('pswp-no-mobile-arrows')

  state.lightbox.init()
}

/**
 * Open the lightbox to the item at `index` (0-based into `state.items`).
 * No-op if the lightbox hasn't been initialised yet.
 */
export function openLightbox (index: number) {
  if (state.lightbox) state.lightbox.loadAndOpen(index)
}

/**
 * Scroll the page so the tile for the given item is comfortably in view.
 * Called from the lightbox close handler - if the user navigated prev/next
 * inside the lightbox, or arrived via a #asset-id deep link, the tile they
 * end on may be far from the original scroll position. We only scroll when
 * the tile is genuinely off-screen, so closing on a still-visible tile
 * doesn't jiggle the page.
 */
function scrollToCurrentSlide (index: number) {
  if (!state.container || index == null || !state.layout[index]) return
  const entry = state.layout[index]
  const containerTop = state.container.getBoundingClientRect().top + window.scrollY
  const tileTop = containerTop + entry.top
  const tileBottom = tileTop + entry.height
  const viewportTop = window.scrollY
  const viewportBottom = viewportTop + window.innerHeight
  // Already mostly visible - leave the scroll alone
  if (tileTop >= viewportTop && tileBottom <= viewportBottom) return
  // Center the tile vertically in the viewport
  const targetScroll = tileTop - (window.innerHeight - entry.height) / 2
  window.scrollTo({ top: Math.max(0, targetScroll), behavior: 'instant' })
}
