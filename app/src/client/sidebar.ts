// Info sidebar that surfaces description + EXIF + location metadata for the
// current lightbox slide. Modelled on Immich's native DetailPanel:
// docked to the right (image shrinks to fit), slide-in transition, close
// button top-left, sections only render when their data is present. Toggled
// by the toolbar info button or the `i` key, persisted via localStorage.

import { state, SIDEBAR_STORAGE_KEY } from './state.js'
import { ICON_INFO, ICON_CLOSE, ICON_IMAGE, ICON_CAMERA, ICON_IRIS, ICON_MAP } from './icons.js'
import type { GalleryItem, GalleryExif } from '../shared/types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LightboxInstance = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PswpInstance = any

interface PswpUiElementConfig {
  name: string
  order: number
  isButton: boolean
  tagName?: string
  ariaLabel?: string
  appendTo?: string
  html?: string
  onInit?: (el: HTMLElement, pswp: PswpInstance) => void
}

/**
 * Register the sidebar panel + toolbar toggle button + `i` keybinding.
 * Called once from initLightbox after the lightbox is constructed.
 */
export function registerSidebar (lightbox: LightboxInstance) {
  lightbox.on('uiRegister', () => {
    lightbox.pswp.ui.registerElement({
      name: 'sidebar',
      order: 100,
      isButton: false,
      appendTo: 'root',
      onInit: (el: HTMLElement, pswp: PswpInstance) => {
        el.classList.add('ipp-sidebar')
        el.setAttribute('aria-label', 'Photo information')
        const renderSidebar = () => renderContents(el, state.items[pswp.currIndex])
        renderSidebar()
        pswp.on('change', renderSidebar)
        // Re-render when a lazy album item's detail arrives after open.
        state.slideRefreshers.push(renderSidebar)
        pswp.on('destroy', () => {
          document.documentElement.classList.remove('ipp-sidebar-open')
        })
        applyOpenState(pswp)
      }
    } as PswpUiElementConfig)

    lightbox.pswp.ui.registerElement({
      name: 'sidebar-toggle',
      order: 7,
      isButton: true,
      ariaLabel: 'Info',
      html: ICON_INFO,
      onInit: (el: HTMLElement, pswp: PswpInstance) => {
        el.addEventListener('click', () => toggleSidebar(pswp))
      }
    } as PswpUiElementConfig)

    // Restore persisted state on open
    state.sidebarOpen = readPersistedState()
    applyOpenState(lightbox.pswp)
  })

  // `i` toggles the sidebar while the lightbox is open. Escape closes the
  // sidebar first on press; PhotoSwipe handles a second Escape to close
  // the lightbox. We attach to window because PhotoSwipe doesn't expose a
  // keypress hook for arbitrary keys.
  window.addEventListener('keydown', (e) => {
    if (!state.lightbox || !state.lightbox.pswp) return
    if (e.key === 'i' || e.key === 'I') {
      // Don't steal `i` from text inputs (none exist in the lightbox today,
      // but better safe).
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      e.preventDefault()
      toggleSidebar(state.lightbox.pswp)
    } else if (e.key === 'Escape' && state.sidebarOpen) {
      // Close the sidebar but let PhotoSwipe still see the Escape on the
      // next press (we don't stopPropagation here).
      setSidebarOpen(state.lightbox.pswp, false)
    }
  })
}

function toggleSidebar (pswp: PswpInstance) {
  setSidebarOpen(pswp, !state.sidebarOpen)
}

function setSidebarOpen (pswp: PswpInstance, open: boolean) {
  if (state.sidebarOpen === open) return
  state.sidebarOpen = open
  writePersistedState(open)
  applyOpenState(pswp)
}

function applyOpenState (pswp: PswpInstance) {
  const root = document.documentElement
  if (state.sidebarOpen) root.classList.add('ipp-sidebar-open')
  else root.classList.remove('ipp-sidebar-open')
  // Recalculate slide size so the image fits in the new container width.
  if (pswp && typeof pswp.updateSize === 'function') {
    pswp.updateSize(true)
  }
}

function readPersistedState (): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'
  } catch (e) {
    return false
  }
}

function writePersistedState (open: boolean) {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, open ? '1' : '0')
  } catch (e) {
    // Quota exceeded / private mode - ignore, state stays in memory only.
  }
}

// ----- content rendering ---------------------------------------------------
//
// Sidebar UI placement for each metadata field. Server-side gating lives in
// `gallery/exif.ts` (rules table); legacy-config migration lives in
// `config/migrations.ts`. Adding a new field requires updating all three.

function renderContents (root: HTMLElement, item: GalleryItem | undefined) {
  root.replaceChildren()
  if (!item) return

  root.appendChild(renderHeader())

  const showDescription = state.metadataConfig.descriptionInSidebar && !!item.description
  if (showDescription && item.description) {
    root.appendChild(renderSection('description', renderDescription(item.description)))
  }

  const exif = item.exif
  if (exif && hasAnyExifField(exif)) {
    root.appendChild(renderSection('details', ...renderDetailRows(exif)))
  }

  if (exif && hasAnyLocationField(exif)) {
    root.appendChild(renderSection('location', renderLocation(exif)))
  }

  const noExifShown = !exif || (!hasAnyExifField(exif) && !hasAnyLocationField(exif))
  if (!showDescription && noExifShown) {
    const empty = document.createElement('p')
    empty.className = 'ipp-sidebar-empty'
    empty.textContent = 'No metadata available'
    root.appendChild(empty)
  }
}

function renderHeader (): HTMLElement {
  const header = document.createElement('header')
  header.className = 'ipp-sidebar-header'
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'ipp-sidebar-close'
  close.setAttribute('aria-label', 'Close info')
  close.innerHTML = ICON_CLOSE
  close.addEventListener('click', () => {
    if (state.lightbox && state.lightbox.pswp) setSidebarOpen(state.lightbox.pswp, false)
  })
  header.appendChild(close)
  const title = document.createElement('span')
  title.className = 'ipp-sidebar-title'
  title.textContent = 'Info'
  header.appendChild(title)
  return header
}

function renderSection (className: string, ...children: HTMLElement[]): HTMLElement {
  const section = document.createElement('section')
  section.className = 'ipp-sidebar-section ipp-sidebar-' + className
  for (const child of children) section.appendChild(child)
  return section
}

function renderDescription (description: string): HTMLElement {
  const el = document.createElement('p')
  el.className = 'ipp-sidebar-description'
  el.textContent = description
  return el
}

function renderDetailRows (exif: GalleryExif): HTMLElement[] {
  const heading = document.createElement('h3')
  heading.className = 'ipp-sidebar-heading'
  heading.textContent = 'Details'

  const rows: HTMLElement[] = [heading]

  if (exif.dateTimeOriginal) {
    rows.push(renderDateRow(exif.dateTimeOriginal))
  }
  const fileRow = renderFileRow(exif)
  if (fileRow) rows.push(fileRow)
  const cameraRow = renderCameraRow(exif)
  if (cameraRow) rows.push(cameraRow)
  const lensRow = renderLensRow(exif)
  if (lensRow) rows.push(lensRow)

  return rows
}

function renderDateRow (iso: string): HTMLElement {
  const row = document.createElement('div')
  row.className = 'ipp-sidebar-row ipp-sidebar-date'
  row.textContent = formatDate(iso)
  return row
}

interface RowSpec {
  icon: string
  // Title paragraph at the top of the row body. Falsy values are omitted.
  label?: string | null
  labelClass?: string
  // Stats rendered as `<span>` chips in a flex row beneath the label.
  // Nullish entries are skipped, so callers can write
  // `exif.iso != null ? 'ISO ' + exif.iso : null` and not branch.
  stats: Array<string | null | undefined>
}

/**
 * Build one info-sidebar row. Returns `null` when the row would have
 * neither a label nor any non-null stat, so the caller can skip appending.
 */
function renderRow (spec: RowSpec): HTMLElement | null {
  const presentStats = spec.stats.filter((s): s is string => s != null && s !== '')
  if (!spec.label && presentStats.length === 0) return null

  const row = makeRow(spec.icon)
  const body = row.querySelector('.ipp-sidebar-row-body') as HTMLElement
  if (spec.label) {
    const p = document.createElement('p')
    if (spec.labelClass) p.className = spec.labelClass
    p.textContent = spec.label
    body.appendChild(p)
  }
  if (presentStats.length) {
    const stats = document.createElement('div')
    stats.className = 'ipp-sidebar-stats'
    for (const s of presentStats) stats.appendChild(makeStat(s))
    body.appendChild(stats)
  }
  return row
}

function renderFileRow (exif: GalleryExif): HTMLElement | null {
  const hasDims = !!(exif.width && exif.height)
  const mp = hasDims ? Math.round((exif.width! * exif.height!) / 1_000_000) : 0
  return renderRow({
    icon: ICON_IMAGE,
    label: exif.fileName,
    labelClass: 'ipp-sidebar-filename',
    stats: [
      hasDims && mp >= 1 ? mp + ' MP' : null,
      hasDims ? exif.width + ' x ' + exif.height : null,
      exif.fileSizeInByte ? formatBytes(exif.fileSizeInByte) : null
    ]
  })
}

function renderCameraRow (exif: GalleryExif): HTMLElement | null {
  return renderRow({
    icon: ICON_CAMERA,
    label: [exif.make, exif.model].filter(Boolean).join(' ').trim() || null,
    stats: [
      exif.exposureTime ? exif.exposureTime + ' s' : null,
      exif.iso != null ? 'ISO ' + exif.iso : null
    ]
  })
}

function renderLensRow (exif: GalleryExif): HTMLElement | null {
  return renderRow({
    icon: ICON_IRIS,
    label: exif.lensModel,
    labelClass: 'ipp-sidebar-lens',
    stats: [
      exif.fNumber != null ? 'f/' + exif.fNumber : null,
      exif.focalLength != null ? exif.focalLength + ' mm' : null
    ]
  })
}

function renderLocation (exif: GalleryExif): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'ipp-sidebar-row'
  const icon = document.createElement('div')
  icon.className = 'ipp-sidebar-row-icon'
  icon.innerHTML = ICON_MAP
  wrap.appendChild(icon)
  const body = document.createElement('div')
  body.className = 'ipp-sidebar-row-body'

  const parts = [exif.city, exif.state, exif.country].filter(Boolean) as string[]
  if (parts.length) {
    const place = document.createElement('p')
    place.textContent = parts.join(', ')
    body.appendChild(place)
  }

  if (exif.latitude != null && exif.longitude != null) {
    const coords = document.createElement('p')
    coords.className = 'ipp-sidebar-coords'
    coords.textContent = exif.latitude.toFixed(5) + ', ' + exif.longitude.toFixed(5)
    body.appendChild(coords)

    if (state.metadataConfig.locationWebLink) {
      const link = document.createElement('a')
      link.className = 'ipp-sidebar-osm'
      link.href = 'https://www.openstreetmap.org/?mlat=' + exif.latitude +
        '&mlon=' + exif.longitude +
        '#map=15/' + exif.latitude + '/' + exif.longitude
      link.target = '_blank'
      // noreferrer suppresses the Referer header so the share URL doesn't end up in the map provider's webserver logs
      link.rel = 'noopener noreferrer'
      link.textContent = 'Open in OpenStreetMap'
      body.appendChild(link)
    }
  }

  wrap.appendChild(body)
  return wrap
}

// ----- helpers -------------------------------------------------------------

function makeRow (iconSvg: string): HTMLElement {
  const row = document.createElement('div')
  row.className = 'ipp-sidebar-row'
  const icon = document.createElement('div')
  icon.className = 'ipp-sidebar-row-icon'
  icon.innerHTML = iconSvg
  row.appendChild(icon)
  const body = document.createElement('div')
  body.className = 'ipp-sidebar-row-body'
  row.appendChild(body)
  return row
}

function makeStat (text: string): HTMLElement {
  const span = document.createElement('span')
  span.textContent = text
  return span
}

function hasAnyExifField (exif: GalleryExif): boolean {
  return !!(exif.dateTimeOriginal || exif.fileName || exif.width || exif.fileSizeInByte ||
    exif.make || exif.model || exif.lensModel ||
    exif.exposureTime != null || exif.iso != null ||
    exif.fNumber != null || exif.focalLength != null)
}

function hasAnyLocationField (exif: GalleryExif): boolean {
  return !!(exif.city || exif.state || exif.country ||
    (exif.latitude != null && exif.longitude != null))
}

function formatDate (iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(d)
  } catch (e) {
    return iso
  }
}

function formatBytes (bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  const kb = bytes / 1024
  if (kb < 1024) return kb.toFixed(1) + ' KB'
  const mb = kb / 1024
  if (mb < 1024) return mb.toFixed(1) + ' MB'
  return (mb / 1024).toFixed(2) + ' GB'
}
