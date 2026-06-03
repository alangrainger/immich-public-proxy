// Viewport-based tile / header lifecycle. Only tiles within viewport ± 1
// viewport-height buffer exist in the DOM at any moment. The image-src
// lifecycle (lazy load / unload of `img.src`) is part of the same loop.

import {
  state,
  IMAGE_LOAD_MARGIN_PX,
  SCROLL_SETTLE_MS,
  BUFFER_VIEWPORTS,
  type HeaderEntry
} from './state.js'
import { computeLayout } from './layout.js'
import { createTile } from './tiles.js'

function getVisibleRange () {
  if (!state.container) return { top: 0, bottom: 0 }
  const containerTop = state.container.getBoundingClientRect().top
  const viewportTopInContainer = -containerTop
  const viewportBottomInContainer = viewportTopInContainer + window.innerHeight
  const buffer = window.innerHeight * BUFFER_VIEWPORTS
  return {
    top: viewportTopInContainer - buffer,
    bottom: viewportBottomInContainer + buffer
  }
}

function createHeader (header: HeaderEntry): HTMLElement {
  const el = document.createElement('h2')
  el.className = 'group-header'
  el.style.top = header.top + 'px'
  el.textContent = header.label
  return el
}

/**
 * Bring the DOM in line with the current visible range: create tiles and
 * headers that should now be on screen, remove ones that have scrolled out.
 * Idempotent; safe to call multiple times per frame (scroll handler does).
 */
export function virtualize () {
  if (!state.container || !state.layout.length) return
  const { top, bottom } = getVisibleRange()

  // Tiles
  const neededTiles = new Set<number>()
  for (const l of state.layout) {
    if (!l) continue
    if (l.top + l.height < top) continue
    if (l.top > bottom) break
    neededTiles.add(l.index)
  }
  for (const [index, el] of state.renderedTiles) {
    if (!neededTiles.has(index)) {
      el.remove()
      state.renderedTiles.delete(index)
    }
  }
  for (const index of neededTiles) {
    if (state.renderedTiles.has(index)) continue
    const tile = createTile(index)
    state.container.appendChild(tile)
    state.renderedTiles.set(index, tile)
  }

  // Group headers (when grouping is enabled; headers is empty otherwise)
  const neededHeaders = new Set<string>()
  for (const h of state.headers) {
    if (h.top + h.height < top) continue
    if (h.top > bottom) break
    neededHeaders.add(h.label)
  }
  for (const [label, el] of state.renderedHeaders) {
    if (!neededHeaders.has(label)) {
      el.remove()
      state.renderedHeaders.delete(label)
    }
  }
  for (const label of neededHeaders) {
    if (state.renderedHeaders.has(label)) continue
    const h = state.headers.find(x => x.label === label)
    if (!h) continue
    const el = createHeader(h)
    state.container.appendChild(el)
    state.renderedHeaders.set(label, el)
  }
}

/**
 * Recompute the layout when the container width has actually changed, then
 * re-virtualize and load images for the visible range. If the width is the
 * same as last time (e.g. a resize fired but the gallery column is unchanged)
 * the cached layout is reused and only virtualize runs.
 *
 * Called from the ResizeObserver in init.ts.
 */
export function computeLayoutAndRender () {
  if (!state.container) return
  const containerW = state.container.clientWidth
  if (containerW <= 0) return
  if (containerW === state.lastContainerW) {
    virtualize()
    return
  }
  state.lastContainerW = containerW

  const result = computeLayout(containerW)
  state.layout = result.layout
  state.headers = result.headers
  state.container.style.height = result.totalHeight + 'px'

  for (const [, el] of state.renderedTiles) el.remove()
  state.renderedTiles.clear()
  for (const [, el] of state.renderedHeaders) el.remove()
  state.renderedHeaders.clear()

  virtualize()
  loadVisibleTiles()
}

/**
 * Walk the currently rendered tiles and toggle their `<img>` src based on
 * proximity to the viewport. Tiles within IMAGE_LOAD_MARGIN_PX get their
 * `data-src` promoted to `src` (browser fetches the thumbnail); tiles far
 * off-screen with an unfinished load have their `src` parked back into
 * `data-src` so the browser cancels the fetch.
 *
 * Run after scroll has settled, not on every scroll tick.
 */
export function loadVisibleTiles () {
  if (!state.container) return
  const vpHeight = window.innerHeight
  const containerTop = state.container.getBoundingClientRect().top
  for (const a of state.renderedTiles.values()) {
    const img = a.firstElementChild
    if (!(img instanceof HTMLImageElement)) continue
    const aTopInVp = containerTop + parseFloat(a.style.top || '0')
    const aHeight = parseFloat(a.style.height || '0')
    const isFar = aTopInVp + aHeight < -IMAGE_LOAD_MARGIN_PX ||
      aTopInVp > vpHeight + IMAGE_LOAD_MARGIN_PX
    if (isFar) {
      if (img.src && !img.complete) {
        img.dataset.src = img.src
        img.removeAttribute('src')
      }
    } else if (img.dataset.src) {
      img.src = img.dataset.src
      img.removeAttribute('data-src')
    }
  }
}

let scrollFrame: number | null = null
let loadTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Window scroll handler. Coalesces virtualize calls into the next animation
 * frame and debounces the more expensive image-src lifecycle by
 * SCROLL_SETTLE_MS so we don't thrash `img.src` during fast flings.
 */
export function onScroll () {
  if (scrollFrame == null) {
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null
      virtualize()
    })
  }
  if (loadTimer) clearTimeout(loadTimer)
  loadTimer = setTimeout(() => {
    loadTimer = null
    loadVisibleTiles()
  }, SCROLL_SETTLE_MS)
}
