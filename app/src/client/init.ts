// Gallery client entry point. Reads the JSON init block from the page,
// populates shared state, sets up the toolbar + lightbox, attaches the
// resize / scroll observers, and handles deep-link opening.
//
// Layout is pre-computed for all items based on container width. Only tiles
// within viewport ± 1 viewport-height buffer exist in the DOM at any moment.
// PhotoSwipe runs with a full dataSource array so the lightbox navigates
// across all items regardless of which tiles are currently rendered.

import type { InitParams } from '../shared/types.js'
import { state } from './state.js'
import { setupToolbar } from './selection.js'
import { initLightbox, openLightbox } from './lightbox.js'
import { computeLayoutAndRender, onScroll } from './virtualisation.js'

function readInitParams (): InitParams {
  const el = document.getElementById('ipp-init')
  if (!el) return {}
  try { return JSON.parse(el.textContent || '{}') } catch (e) { return {} }
}

function init () {
  const params = readInitParams()
  state.items = params.items || []
  state.lightboxConfig = params.lightboxConfig || {}
  if (params.metadataConfig) state.metadataConfig = params.metadataConfig
  state.groupByDate = !!params.groupByDate
  state.metaBase = params.metaBase || ''
  state.container = document.getElementById('gallery')
  if (!state.container) return

  setupToolbar()
  initLightbox()

  let resizeFrame: number | undefined
  const resizeObserver = new ResizeObserver(() => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame)
    resizeFrame = requestAnimationFrame(computeLayoutAndRender)
  })
  resizeObserver.observe(state.container)

  window.addEventListener('scroll', onScroll, { passive: true })

  // Deep-link: prefer #asset-id in the URL hash, fall back to ?openItem
  const hash = window.location.hash.slice(1)
  if (hash) {
    const idx = state.items.findIndex(it => it.id === hash)
    if (idx >= 0) openLightbox(idx)
  } else if (params.openItem && params.openItem > 0 && params.openItem <= state.items.length) {
    openLightbox(params.openItem - 1)
  }
}

init()
