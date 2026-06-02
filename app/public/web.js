// @ts-check
// ============================================================================
// Gallery client - virtualized justified/square grid, PhotoSwipe v5 lightbox
//
// Layout is pre-computed for all items based on container width. Only tiles
// within viewport ± 1 viewport-height buffer exist in the DOM at any moment.
// PhotoSwipe runs with a full dataSource array so the lightbox navigates
// across all items regardless of which tiles are currently rendered.
// ============================================================================

// Runtime URLs served by Express, not filesystem paths. TypeScript's resolver
// can't follow them, so we silence its module-not-found errors here. The
// imports themselves work fine at runtime.
// @ts-ignore
import PhotoSwipeLightbox from '/share/static/photoswipe/photoswipe-lightbox.esm.js'
// @ts-ignore
import { thumbHashToDataURL } from '/share/static/thumbhash/thumbhash.js'

/**
 * @typedef {Object} GalleryItem
 * @property {string} id
 * @property {'IMAGE'|'VIDEO'} type
 * @property {string} previewUrl
 * @property {string} thumbnailUrl
 * @property {string} [downloadUrl]
 * @property {string} [videoData]    JSON-stringified video source info
 * @property {string} [description]  Escaped HTML fragment for the lightbox caption
 * @property {string} downloadFilename
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [thumbhash]
 * @property {string} [fileCreatedAt]  ISO date
 */

/**
 * @typedef {Object} LightboxConfig
 * @property {boolean} [showArrows]
 * @property {boolean} [showDownload]
 * @property {boolean} [mobileArrows]
 * @property {Record<string, unknown>} [options]
 */

/**
 * @typedef {Object} InitParams
 * @property {GalleryItem[]} [items]
 * @property {number} [openItem]            1-based; opens lightbox on the Nth item
 * @property {LightboxConfig} [lightboxConfig]
 * @property {boolean} [groupByDate]
 */

/**
 * @typedef {Object} LayoutEntry
 * @property {number} index
 * @property {number} left
 * @property {number} top
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} HeaderEntry
 * @property {string} label
 * @property {number} top
 * @property {number} height
 */

/**
 * @typedef {Object} GroupSpec
 * @property {string | null} label
 * @property {number[]} indices
 */

// Justified-rows target row height (matches Immich's main view)
const TARGET_ROW_HEIGHT = 235
const GAP = 4
const MOBILE_BREAKPOINT = 640
const MOBILE_COLS = 3
const IMAGE_LOAD_MARGIN_PX = 300
const SCROLL_SETTLE_MS = 100
const BUFFER_VIEWPORTS = 1
// Height reserved for each month header (must agree with .group-header CSS)
const HEADER_HEIGHT = 48
// Vertical gap between groups
const GROUP_GAP = 16

// MDI icons (Apache 2.0). Same icon set Immich uses for its viewer.
const ICON_DOWNLOAD = '<svg class="pswp__icn" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/></svg>'
const ICON_FULLSCREEN = '<svg class="pswp__icn" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z"/></svg>'
const ICON_FULLSCREEN_EXIT = '<svg class="pswp__icn" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14,14H19V16H16V19H14V14M5,14H10V19H8V16H5V14M8,5H10V10H5V8H8V5M19,8V10H14V5H16V8H19Z"/></svg>'

// ----- module state ---------------------------------------------------------

/** @type {GalleryItem[]} */
let items = []
/** @type {LayoutEntry[]} - sparse, indexed by GalleryItem index */
let layout = []
/** @type {HeaderEntry[]} - empty when groupByDate is off */
let headers = []
let groupByDate = false
/** @type {HTMLElement | null} */
let container = null
/** @type {any} - PhotoSwipeLightbox instance; external module, leave untyped */
let lightbox = null
/** @type {LightboxConfig} */
let lightboxConfig = {}
/** @type {boolean} - true while our pushed history entry is live */
let lightboxPushedHistory = false
/** @type {boolean} - guards against re-entering the popstate handler during our own history.back() */
let closingFromHistory = false
/** @type {Map<number, HTMLAnchorElement>} */
const renderedTiles = new Map()
/** @type {Map<string, HTMLElement>} */
const renderedHeaders = new Map()
let lastContainerW = 0

// Selection mode (mode-toggle UX: hidden checkmarks until activated)
let selectMode = false
/** @type {Set<string>} - set of asset IDs */
const selected = new Set()
/** @type {HTMLElement | null} */
let toolbarEl = null
/** @type {HTMLElement | null} */
let countEl = null
/** @type {HTMLButtonElement | null} */
let selectAllBtn = null
/** @type {HTMLButtonElement | null} */
let cancelBtn = null
/** @type {HTMLButtonElement | null} */
let downloadBtn = null

// Inline SVG for the check icon shown inside selected tiles' checkmark circle
const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>'

// Long-press threshold for entering select mode via touch/mouse
const LONG_PRESS_MS = 500

// ----- layout computation ---------------------------------------------------

function computeLayout (containerW) {
  const tileLayout = new Array(items.length)
  const newHeaders = []
  const groups = groupByDate ? groupItemsByMonth() : [{ label: null, indices: itemIndices() }]
  const isMobile = containerW < MOBILE_BREAKPOINT
  let y = 0
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g]
    if (group.label) {
      newHeaders.push({ label: group.label, top: y, height: HEADER_HEIGHT })
      y += HEADER_HEIGHT
    }
    y = isMobile
      ? layoutSquareGroup(containerW, group.indices, y, tileLayout)
      : layoutJustifiedGroup(containerW, group.indices, y, tileLayout)
    if (g < groups.length - 1) y += GROUP_GAP
  }
  return {
    layout: tileLayout,
    headers: newHeaders,
    totalHeight: Math.max(0, y)
  }
}

function itemIndices () {
  const out = new Array(items.length)
  for (let i = 0; i < items.length; i++) out[i] = i
  return out
}

/** @returns {GroupSpec[]} */
function groupItemsByMonth () {
  // Preserve item order (already sorted desc by render.ts when grouping is on)
  /** @type {Map<string, GroupSpec>} */
  const map = new Map()
  for (let i = 0; i < items.length; i++) {
    const key = (items[i].fileCreatedAt || '').slice(0, 7) || 'undated'
    let g = map.get(key)
    if (!g) {
      g = { label: monthLabel(key), indices: [] }
      map.set(key, g)
    }
    g.indices.push(i)
  }
  return Array.from(map.values())
}

/** @param {string} key  @returns {string} */
function monthLabel (key) {
  if (key === 'undated') return 'Undated'
  const parts = key.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  if (!y || !m) return key
  // Intl.DateTimeFormat picks up the browser's locale; UTC timeZone keeps
  // the displayed month consistent with the UTC YYYY-MM bucket key.
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(y, m - 1, 1)))
}

/**
 * @param {number} containerW
 * @param {number[]} indices
 * @param {number} startY
 * @param {LayoutEntry[]} tileLayout
 * @returns {number} The y position past the last tile (no trailing gap)
 */
function layoutSquareGroup (containerW, indices, startY, tileLayout) {
  const tileSize = Math.floor((containerW - (MOBILE_COLS - 1) * GAP) / MOBILE_COLS)
  let col = 0
  let x = 0
  let y = startY
  for (const idx of indices) {
    tileLayout[idx] = { index: idx, left: x, top: y, width: tileSize, height: tileSize }
    col++
    if (col === MOBILE_COLS) {
      col = 0
      x = 0
      y += tileSize + GAP
    } else {
      x += tileSize + GAP
    }
  }
  // If the last row was partial, advance y to past it
  if (col > 0) y += tileSize
  // Otherwise back off the trailing inter-row gap
  else if (y > startY) y -= GAP
  return y
}

function layoutJustifiedGroup (containerW, indices, startY, tileLayout) {
  let rowItems = []
  let aspectSum = 0
  let y = startY

  const applyRow = (rowItems, height, isLastRow) => {
    const intHeight = Math.floor(height)
    let x = 0
    rowItems.forEach(({ idx, aspect }, i) => {
      const isFinalInRow = i === rowItems.length - 1
      const w = (!isLastRow && isFinalInRow)
        ? containerW - x
        : Math.floor(aspect * height)
      tileLayout[idx] = { index: idx, left: x, top: y, width: w, height: intHeight }
      x += w + GAP
    })
    y += intHeight + GAP
  }

  for (const idx of indices) {
    const item = items[idx]
    const w = item.width || 1
    const h = item.height || 1
    const aspect = w / h
    rowItems.push({ idx, aspect })
    aspectSum += aspect
    const projectedH = (containerW - (rowItems.length - 1) * GAP) / aspectSum
    if (projectedH <= TARGET_ROW_HEIGHT) {
      applyRow(rowItems, projectedH, false)
      rowItems = []
      aspectSum = 0
    }
  }
  if (rowItems.length) applyRow(rowItems, TARGET_ROW_HEIGHT, true)

  // y advanced past the last row's trailing gap; back off
  return y > startY ? y - GAP : y
}

// ----- tile DOM construction ------------------------------------------------

function onThumbError () {
  this.closest('a').classList.add('thumb-error')
}

// Cache of decoded thumbhash → PNG data URL. Same thumbhash on multiple
// tile-creations (revisits during virtualization) reuses the same URL.
const thumbhashCache = new Map()

function decodeThumbhash (base64) {
  const cached = thumbhashCache.get(base64)
  if (cached) return cached
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i)
    const url = thumbHashToDataURL(bytes)
    thumbhashCache.set(base64, url)
    return url
  } catch (e) {
    return null
  }
}

function createTile (index) {
  const item = items[index]
  const l = layout[index]
  const a = document.createElement('a')
  a.dataset.index = index
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
  if (toolbarEl) {
    const check = document.createElement('div')
    check.className = 'tile-check'
    check.innerHTML = CHECK_SVG
    check.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!selectMode) enterSelectMode()
      toggleSelection(item.id)
    })
    a.appendChild(check)
    if (selected.has(item.id)) a.classList.add('selected')
    attachLongPress(a, item.id)
  }

  a.addEventListener('click', (e) => {
    e.preventDefault()
    if (selectMode) {
      toggleSelection(item.id)
    } else {
      openLightbox(index)
    }
  })

  return a
}

// ----- long-press (enter select mode) --------------------------------------

function attachLongPress (tile, id) {
  let timer = null
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
      if (!selectMode) enterSelectMode()
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

// ----- selection state -----------------------------------------------------

function enterSelectMode () {
  if (selectMode) return
  selectMode = true
  if (container) container.classList.add('select-mode')
  if (toolbarEl) toolbarEl.hidden = false
}

function exitSelectMode () {
  if (!selectMode) return
  selectMode = false
  // Clear DOM markers on the tiles currently in the DOM
  for (const a of renderedTiles.values()) a.classList.remove('selected')
  selected.clear()
  if (container) container.classList.remove('select-mode')
  if (toolbarEl) toolbarEl.hidden = true
  updateSelectionUI()
}

function toggleSelection (id) {
  if (selected.has(id)) selected.delete(id)
  else selected.add(id)
  const idx = items.findIndex(it => it.id === id)
  const tile = idx >= 0 ? renderedTiles.get(idx) : null
  if (tile) tile.classList.toggle('selected', selected.has(id))
  // Auto-exit if user deselected the last item
  if (selected.size === 0 && selectMode) exitSelectMode()
  else updateSelectionUI()
}

function updateSelectionUI () {
  if (countEl) {
    countEl.textContent = selected.size + ' selected'
  }
  if (downloadBtn) downloadBtn.disabled = selected.size === 0
  if (selectAllBtn) {
    selectAllBtn.textContent =
      selected.size === items.length ? 'Deselect all' : 'Select all'
  }
}

function selectAllOrNone () {
  if (selected.size === items.length) {
    // Deselect all but keep select mode active
    for (const a of renderedTiles.values()) a.classList.remove('selected')
    selected.clear()
    updateSelectionUI()
  } else {
    if (!selectMode) enterSelectMode()
    for (const item of items) selected.add(item.id)
    for (const a of renderedTiles.values()) a.classList.add('selected')
    updateSelectionUI()
  }
}

function downloadSelected () {
  if (selected.size === 0) return
  // Single selection: download the file directly so the user gets the image
  // (or video) instead of a one-entry zip.
  if (selected.size === 1) {
    const id = selected.values().next().value
    const item = items.find(it => it.id === id)
    if (item && item.downloadUrl) {
      const a = document.createElement('a')
      a.href = item.downloadUrl
      a.download = item.downloadFilename || ''
      document.body.appendChild(a)
      a.click()
      a.remove()
      return
    }
  }
  // Form POST so the browser handles streaming the zip directly to disk.
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = window.location.pathname + '/download'
  const input = document.createElement('input')
  input.type = 'hidden'
  input.name = 'assets'
  input.value = JSON.stringify(Array.from(selected))
  form.appendChild(input)
  document.body.appendChild(form)
  form.submit()
  form.remove()
}

function setupToolbar () {
  toolbarEl = document.getElementById('select-toolbar')
  // No toolbar means downloads aren't allowed for this share; nothing to wire
  if (!toolbarEl) return
  countEl = document.getElementById('select-count')
  selectAllBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('select-all'))
  cancelBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('select-cancel'))
  downloadBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('select-download'))
  if (cancelBtn) cancelBtn.addEventListener('click', exitSelectMode)
  if (selectAllBtn) selectAllBtn.addEventListener('click', selectAllOrNone)
  if (downloadBtn) downloadBtn.addEventListener('click', downloadSelected)
  updateSelectionUI()
}

// ----- virtualization -------------------------------------------------------

function getVisibleRange () {
  const containerTop = container.getBoundingClientRect().top
  const viewportTopInContainer = -containerTop
  const viewportBottomInContainer = viewportTopInContainer + window.innerHeight
  const buffer = window.innerHeight * BUFFER_VIEWPORTS
  return {
    top: viewportTopInContainer - buffer,
    bottom: viewportBottomInContainer + buffer
  }
}

function createHeader (header) {
  const el = document.createElement('h2')
  el.className = 'group-header'
  el.style.top = header.top + 'px'
  el.textContent = header.label
  return el
}

function virtualize () {
  if (!container || !layout.length) return
  const { top, bottom } = getVisibleRange()

  // Tiles
  const neededTiles = new Set()
  for (const l of layout) {
    if (!l) continue
    if (l.top + l.height < top) continue
    if (l.top > bottom) break
    neededTiles.add(l.index)
  }
  for (const [index, el] of renderedTiles) {
    if (!neededTiles.has(index)) {
      el.remove()
      renderedTiles.delete(index)
    }
  }
  for (const index of neededTiles) {
    if (renderedTiles.has(index)) continue
    const tile = createTile(index)
    container.appendChild(tile)
    renderedTiles.set(index, tile)
  }

  // Group headers (when grouping is enabled; headers is empty otherwise)
  const neededHeaders = new Set()
  for (const h of headers) {
    if (h.top + h.height < top) continue
    if (h.top > bottom) break
    neededHeaders.add(h.label)
  }
  for (const [label, el] of renderedHeaders) {
    if (!neededHeaders.has(label)) {
      el.remove()
      renderedHeaders.delete(label)
    }
  }
  for (const label of neededHeaders) {
    if (renderedHeaders.has(label)) continue
    const h = headers.find(x => x.label === label)
    if (!h) continue
    const el = createHeader(h)
    container.appendChild(el)
    renderedHeaders.set(label, el)
  }
}

function computeLayoutAndRender () {
  if (!container) return
  const containerW = container.clientWidth
  if (containerW <= 0) return
  if (containerW === lastContainerW) {
    virtualize()
    return
  }
  lastContainerW = containerW

  const result = computeLayout(containerW)
  layout = result.layout
  headers = result.headers
  container.style.height = result.totalHeight + 'px'

  for (const [, el] of renderedTiles) el.remove()
  renderedTiles.clear()
  for (const [, el] of renderedHeaders) el.remove()
  renderedHeaders.clear()

  virtualize()
  loadVisibleTiles()
}

// ----- image src lifecycle --------------------------------------------------

function loadVisibleTiles () {
  if (!container) return
  const vpHeight = window.innerHeight
  const containerTop = container.getBoundingClientRect().top
  for (const a of renderedTiles.values()) {
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

// ----- scroll handling ------------------------------------------------------

let scrollFrame = null
let loadTimer = null

function onScroll () {
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

// ----- PhotoSwipe -----------------------------------------------------------

function parseVideoData (item) {
  try {
    const data = JSON.parse(item.videoData || '{}')
    const source = (data.source && data.source[0]) || {}
    return { src: source.src || '', type: source.type || 'video/mp4' }
  } catch (e) {
    return { src: '', type: 'video/mp4' }
  }
}

function escapeAttr (s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildDataSource () {
  return items.map(item => {
    if (item.type === 'VIDEO') {
      const v = parseVideoData(item)
      return {
        html:
          '<div class="pswp__video-wrap">' +
          '<video controls playsinline poster="' + escapeAttr(item.thumbnailUrl) + '">' +
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

function initLightbox () {
  const { options = {} } = lightboxConfig

  lightbox = new PhotoSwipeLightbox({
    bgOpacity: 1,
    showHideAnimationType: 'fade',
    closeOnVerticalDrag: true,
    arrowKeys: true,
    loop: false,
    padding: { top: 56, bottom: 56, left: 16, right: 16 },
    ...options,
    dataSource: buildDataSource(),
    pswpModule: () => import('/share/static/photoswipe/photoswipe.esm.js')
  })

  // Download button (only registered if config enables it)
  if (lightboxConfig.showDownload) {
    lightbox.on('uiRegister', () => {
      lightbox.pswp.ui.registerElement({
        name: 'download-button',
        order: 8,
        isButton: true,
        tagName: 'a',
        ariaLabel: 'Download',
        html: ICON_DOWNLOAD,
        onInit: (el, pswp) => {
          el.setAttribute('target', '_blank')
          el.setAttribute('rel', 'noopener')
          const update = () => {
            const item = items[pswp.currIndex]
            if (item && item.downloadUrl) {
              el.href = item.downloadUrl
              el.setAttribute('download', item.downloadFilename || '')
            } else {
              el.removeAttribute('href')
            }
          }
          update()
          pswp.on('change', update)
        }
      })
    })
  }

  // Fullscreen toggle. Skipped on browsers without Fullscreen API support
  // for arbitrary elements (notably iOS Safari on iPhone).
  if (document.fullscreenEnabled) {
    lightbox.on('uiRegister', () => {
      lightbox.pswp.ui.registerElement({
        name: 'fullscreen-button',
        order: 9,
        isButton: true,
        html: ICON_FULLSCREEN,
        onInit: (el, pswp) => {
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

  // Caption from EXIF description (only present when item.description is set;
  // server-side gated on ipp.showMetadata.description). Content is already
  // HTML-escaped in render.ts, so innerHTML assignment is safe.
  lightbox.on('uiRegister', () => {
    lightbox.pswp.ui.registerElement({
      name: 'caption',
      order: 9,
      isButton: false,
      appendTo: 'root',
      onInit: (el, pswp) => {
        el.classList.add('pswp__caption')
        const render = () => {
          const item = items[pswp.currIndex]
          const text = (item && item.description) || ''
          el.innerHTML = text
          el.hidden = !text
        }
        render()
        pswp.on('change', render)
      }
    })
  })

  // Hash navigation + back-button handling: push a history entry on open so
  // the mobile back gesture closes the lightbox; sync the hash with the
  // current slide as the user pages through.
  lightbox.on('uiRegister', () => {
    const pswp = lightbox.pswp
    const item = items[pswp.currIndex]
    if (item) {
      history.pushState({ pswp: true }, '', '#' + item.id)
      lightboxPushedHistory = true
    }
    pswp.on('change', () => {
      const it = items[pswp.currIndex]
      if (it) history.replaceState({ pswp: lightboxPushedHistory }, '', '#' + it.id)
    })
    pswp.on('close', () => {
      document.querySelectorAll('.pswp__video-wrap video').forEach(v => { v.pause(); v.currentTime = 0 })
      scrollToCurrentSlide(pswp.currIndex)
      const wasFromHistory = closingFromHistory
      closingFromHistory = false
      if (wasFromHistory) {
        // popstate already moved us back; nothing more to do
        lightboxPushedHistory = false
      } else if (lightboxPushedHistory) {
        // UI close (button / Esc / swipe-down): consume our pushed entry
        closingFromHistory = true
        lightboxPushedHistory = false
        history.back()
      } else {
        history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    })
  })

  window.addEventListener('popstate', () => {
    if (closingFromHistory) {
      // Our own history.back() during a UI-driven close
      closingFromHistory = false
      return
    }
    if (lightbox && lightbox.pswp && lightboxPushedHistory) {
      closingFromHistory = true
      lightbox.pswp.close()
    }
  })

  // Optional control hiding (defaults match Immich's behavior)
  const docEl = document.documentElement
  if (!lightboxConfig.showArrows) docEl.classList.add('pswp-no-arrows')
  if (!lightboxConfig.mobileArrows) docEl.classList.add('pswp-no-mobile-arrows')

  // Video autoplay
  let autoplayInterval = null
  let lastAutoplayIndex = -1

  const tryAutoplay = () => {
    if (!lightbox.pswp || !lightbox.pswp.currSlide || !lightbox.pswp.currSlide.isActive) return
    const index = lightbox.pswp.currIndex
    if (index === lastAutoplayIndex) return

    const item = items[index]
    if (!item) return
    
    // If it's a video, wait for the DOM element to actually exist
    const video = lightbox.pswp.currSlide.container
      ? lightbox.pswp.currSlide.container.querySelector('video')
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

  lightbox.on('uiRegister', () => {
    // Start polling when lightbox opens
    autoplayInterval = setInterval(tryAutoplay, 50)

    lightbox.pswp.on('close', () => {
      clearInterval(autoplayInterval)
      lastAutoplayIndex = -1
    })
  })

  // We still use contentDeactivate to immediately pause videos when sliding away
  lightbox.on('contentDeactivate', ({ content }) => {
    const video = content && content.element && content.element.querySelector
      ? content.element.querySelector('video')
      : null
    if (video) { video.pause(); video.currentTime = 0 }
  })

  lightbox.init()
}

function openLightbox (index) {
  if (lightbox) lightbox.loadAndOpen(index)
}

/**
 * Scroll the page so the tile for the given item is comfortably in view.
 * Called from the lightbox close handler - if the user navigated prev/next
 * inside the lightbox, or arrived via a #asset-id deep link, the tile they
 * end on may be far from the original scroll position. We only scroll when
 * the tile is genuinely off-screen, so closing on a still-visible tile
 * doesn't jiggle the page.
 */
function scrollToCurrentSlide (index) {
  if (!container || index == null || !layout[index]) return
  const entry = layout[index]
  const containerTop = container.getBoundingClientRect().top + window.scrollY
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

// ----- entry point ----------------------------------------------------------

function readInitParams () {
  const el = document.getElementById('ipp-init')
  if (!el) return {}
  try { return JSON.parse(el.textContent || '{}') } catch (e) { return {} }
}

function init () {
  const params = readInitParams()
  items = params.items || []
  lightboxConfig = params.lightboxConfig || {}
  groupByDate = !!params.groupByDate
  container = document.getElementById('gallery')
  if (!container) return

  setupToolbar()
  initLightbox()

  let resizeFrame
  const resizeObserver = new ResizeObserver(() => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame)
    resizeFrame = requestAnimationFrame(computeLayoutAndRender)
  })
  resizeObserver.observe(container)

  window.addEventListener('scroll', onScroll, { passive: true })

  // Deep-link: prefer #asset-id in the URL hash, fall back to ?openItem
  const hash = window.location.hash.slice(1)
  if (hash) {
    const idx = items.findIndex(it => it.id === hash)
    if (idx >= 0) openLightbox(idx)
  } else if (params.openItem && params.openItem > 0 && params.openItem <= items.length) {
    openLightbox(params.openItem - 1)
  }
}

init()
