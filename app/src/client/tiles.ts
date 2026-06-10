// Per-tile DOM construction: anchor, image, thumbhash blur background, video
// play icon, selection checkmark, click + long-press handlers.

// Runtime URL resolved by Express static, not a TS-resolvable module path.
// @ts-expect-error - browser-only ESM URL
import { thumbHashToDataURL } from '/share/static/thumbhash/thumbhash.js' // eslint-disable-line import/no-absolute-path

import { state, LONG_PRESS_MS } from './state.js'
import { CHECK_SVG } from './icons.js'
import { enterSelectMode, toggleSelection } from './selection.js'
import { openLightbox } from './lightbox.js'

function onThumbError (this: HTMLImageElement) {
  this.closest('a')?.classList.add('thumb-error')
}

// Cache of decoded thumbhash → PNG data URL. Same thumbhash on multiple
// tile-creations (revisits during virtualisation) reuses the same URL.
const thumbhashCache = new Map<string, string | null>()

function decodeThumbhash (base64: string): string | null {
  const cached = thumbhashCache.get(base64)
  if (cached !== undefined) return cached
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i)
    const url = thumbHashToDataURL(bytes) as string
    thumbhashCache.set(base64, url)
    return url
  } catch (e) {
    thumbhashCache.set(base64, null)
    return null
  }
}

/**
 * Build the anchor element for one tile at the given index in `state.items`.
 * Positioning is taken from the precomputed `state.layout`.
 *
 * The tile shows the thumbhash blur as a background, an `<img>` whose `src`
 * is held back until the tile enters the viewport (see
 * `loadVisibleTiles`), a play overlay for videos, and a selection
 * checkmark + long-press handler if the share allows downloads.
 *
 * Click opens the lightbox unless selection mode is active, in which case
 * it toggles the item's selection.
 */
export function createTile (index: number): HTMLAnchorElement {
  const item = state.items[index]
  const l = state.layout[index]
  const a = document.createElement('a')
  a.dataset.index = String(index)
  if (item.type !== 'VIDEO') a.href = item.previewUrl
  a.style.left = l.left + 'px'
  a.style.top = l.top + 'px'
  a.style.width = l.width + 'px'
  a.style.height = l.height + 'px'

  if (item.thumbhash) {
    const url = decodeThumbhash(item.thumbhash)
    if (url) a.style.backgroundImage = 'url(' + url + ')'
  }

  const img = document.createElement('img')
  // alt left empty: browsers paint alt text over the thumbhash background
  // while the thumbnail downloads. Description (if any) is shown in the
  // lightbox caption instead.
  img.alt = ''
  img.dataset.src = item.thumbnailUrl
  img.onerror = onThumbError
  // Mark the image as drawable once its bytes are decoded; the CSS rule
  // `#gallery img.loaded` fades opacity from 0 to 1 so the thumbhash blurs
  // into the sharp image instead of snapping (and masks Chrome/Edge's brief
  // white flash between `img.src` being set and the bytes actually painting).
  img.onload = () => img.classList.add('loaded')
  a.appendChild(img)

  if (item.type === 'VIDEO') {
    const playIcon = document.createElement('div')
    playIcon.className = 'play-icon'
    a.appendChild(playIcon)
  }

  // Selection checkmark (rendered only when select mode is even possible -
  // i.e. when the page included the toolbar element)
  if (state.toolbarEl) {
    const check = document.createElement('div')
    check.className = 'tile-check'
    check.innerHTML = CHECK_SVG
    check.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!state.selectMode) enterSelectMode()
      toggleSelection(item.id)
    })
    a.appendChild(check)
    if (state.selected.has(item.id)) a.classList.add('selected')
    attachLongPress(a, item.id)
  }

  a.addEventListener('click', (e) => {
    e.preventDefault()
    if (state.selectMode) {
      toggleSelection(item.id)
    } else {
      openLightbox(index)
    }
  })

  return a
}

/**
 * Wire press-and-hold on a tile to enter selection mode and toggle the
 * tile's item. Cancels on pointer movement above a small threshold (so a
 * scroll gesture doesn't trigger it) and suppresses the synthetic click
 * that follows a successful long-press (so the lightbox doesn't open).
 */
function attachLongPress (tile: HTMLAnchorElement, id: string) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pressed = false
  const cancel = () => {
    if (timer) { clearTimeout(timer); timer = null }
  }
  tile.addEventListener('pointerdown', (e) => {
    // Ignore right/middle clicks
    if (e.button !== undefined && e.button !== 0) return
    pressed = false
    timer = setTimeout(() => {
      timer = null
      pressed = true
      if (!state.selectMode) enterSelectMode()
      toggleSelection(id)
    }, LONG_PRESS_MS)
  })
  tile.addEventListener('pointerup', cancel)
  tile.addEventListener('pointercancel', cancel)
  tile.addEventListener('pointerleave', cancel)
  tile.addEventListener('pointermove', (e) => {
    // Cancel long-press if pointer moves significantly (scroll, drag)
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) cancel()
  })
  // Swallow the synthetic click that follows a successful long-press so it
  // doesn't open the lightbox.
  tile.addEventListener('click', (e) => {
    if (pressed) {
      pressed = false
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  }, true)
}
