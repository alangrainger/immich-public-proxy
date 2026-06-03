// Shared mutable state for the client gallery. Every module that touches
// gallery-wide state goes through `state` rather than holding its own
// top-level `let`s. Constants and icon strings live here too because they
// are read by multiple modules.

import type { GalleryItem, LightboxConfig, MetadataConfig } from '../shared/types.js'

// ----- layout / scroll tuning ----------------------------------------------

// Justified-rows target row height (matches Immich's main view)
export const TARGET_ROW_HEIGHT = 235
export const GAP = 4
export const MOBILE_BREAKPOINT = 640
export const MOBILE_COLS = 3
export const IMAGE_LOAD_MARGIN_PX = 300
export const SCROLL_SETTLE_MS = 100
export const BUFFER_VIEWPORTS = 1
// Height reserved for each month header (must agree with .group-header CSS)
export const HEADER_HEIGHT = 48
// Vertical gap between groups
export const GROUP_GAP = 16
// Long-press threshold for entering select mode via touch/mouse
export const LONG_PRESS_MS = 500

// ----- icons ----------------------------------------------------------------

// MDI icons (Apache 2.0). Same icon set Immich uses for its viewer.
export const ICON_DOWNLOAD = '<svg class="pswp__icn" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/></svg>'
export const ICON_FULLSCREEN = '<svg class="pswp__icn" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z"/></svg>'
export const ICON_FULLSCREEN_EXIT = '<svg class="pswp__icn" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14,14H19V16H16V19H14V14M5,14H10V19H8V16H5V14M8,5H10V10H5V8H8V5M19,8V10H14V5H16V8H19Z"/></svg>'
export const ICON_INFO = '<svg class="pswp__icn" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z"/></svg>'
export const ICON_BACK = '<svg class="pswp__icn" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z"/></svg>'
export const ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg>'
// MDI camera / iris / image icons for the sidebar field rows
export const ICON_IMAGE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z"/></svg>'
export const ICON_CAMERA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z"/></svg>'
export const ICON_IRIS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.73,15L9.83,21.76C10.53,21.91 11.25,22 12,22C14.4,22 16.6,21.15 18.32,19.75L14.66,13.4M2.46,15C3.38,17.92 5.61,20.26 8.45,21.34L12.12,15M8.54,12L4.64,5.25C3,7 2,9.39 2,12C2,12.68 2.07,13.35 2.2,14H9.69M21.8,10H14.31L14.6,10.5L19.36,18.75C21,16.97 22,14.6 22,12C22,11.31 21.93,10.64 21.8,10M21.54,9C20.62,6.07 18.39,3.74 15.55,2.66L11.88,9M9.4,10.5L14.17,2.24C13.47,2.09 12.75,2 12,2C9.6,2 7.4,2.84 5.68,4.25L9.34,10.6L9.4,10.5Z"/></svg>'
export const ICON_MAP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5M12,2A7,7 0 0,0 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9A7,7 0 0,0 12,2Z"/></svg>'
// Inline SVG for the check icon shown inside selected tiles' checkmark circle
export const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>'

// localStorage key for sidebar open state
export const SIDEBAR_STORAGE_KEY = 'ipp-sidebar-open'
// Width of the sidebar when docked (must match the CSS rule)
export const SIDEBAR_WIDTH = 360

// ----- mutable state -------------------------------------------------------

export interface LayoutEntry {
  index: number
  left: number
  top: number
  width: number
  height: number
}

export interface HeaderEntry {
  label: string
  top: number
  height: number
}

export interface GroupSpec {
  label: string | null
  indices: number[]
}

// PhotoSwipeLightbox is an external module with no TS types in this project.
// Typing it as `unknown` would push casts to every call site; `any` is the
// pragmatic choice and stays scoped to this single state slot.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PhotoSwipeLightboxInstance = any

export const state = {
  items: [] as GalleryItem[],
  layout: [] as LayoutEntry[],
  headers: [] as HeaderEntry[],
  groupByDate: false,
  container: null as HTMLElement | null,
  lightbox: null as PhotoSwipeLightboxInstance,
  lightboxConfig: {} as Partial<LightboxConfig>,
  metadataConfig: {
    descriptionInCaption: false,
    descriptionInSidebar: false,
    sidebarHasContent: false,
    locationWebLink: false
  } as MetadataConfig,
  // True while our pushed history entry is live
  lightboxPushedHistory: false,
  // Guards against re-entering the popstate handler during our own history.back()
  closingFromHistory: false,
  lastContainerW: 0,
  renderedTiles: new Map<number, HTMLAnchorElement>(),
  renderedHeaders: new Map<string, HTMLElement>(),
  // Selection mode (mode-toggle UX: hidden checkmarks until activated)
  selectMode: false,
  selected: new Set<string>(),
  toolbarEl: null as HTMLElement | null,
  countEl: null as HTMLElement | null,
  selectAllBtn: null as HTMLButtonElement | null,
  cancelBtn: null as HTMLButtonElement | null,
  downloadBtn: null as HTMLButtonElement | null,
  // Info sidebar open/closed. Persisted to localStorage so the choice
  // survives navigation between slides and gallery reloads.
  sidebarOpen: false
}
