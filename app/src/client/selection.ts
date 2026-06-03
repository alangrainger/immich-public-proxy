// Selection mode (long-press to enter, checkmarks on tiles, toolbar at the
// bottom). Selected IDs are POSTed to /share/:key/download for a server-side
// zip, or downloaded directly for a single selection.

import { state } from './state.js'

/**
 * Activate selection mode. Tiles show their checkmark control, the bottom
 * toolbar reveals itself, and tap on a tile toggles selection instead of
 * opening the lightbox. No-op if already active.
 */
export function enterSelectMode () {
  if (state.selectMode) return
  state.selectMode = true
  if (state.container) state.container.classList.add('select-mode')
  if (state.toolbarEl) state.toolbarEl.hidden = false
}

/**
 * Leave selection mode and clear the selection. Removes the visual marker
 * from every tile currently in the DOM. No-op if not in select mode.
 */
export function exitSelectMode () {
  if (!state.selectMode) return
  state.selectMode = false
  // Clear DOM markers on the tiles currently in the DOM
  for (const a of state.renderedTiles.values()) a.classList.remove('selected')
  state.selected.clear()
  if (state.container) state.container.classList.remove('select-mode')
  if (state.toolbarEl) state.toolbarEl.hidden = true
  updateSelectionUI()
}

/**
 * Add or remove an item from the selection set. Updates the matching tile's
 * visual marker if that tile is currently rendered, and exits selection
 * mode automatically when the last item is deselected.
 */
export function toggleSelection (id: string) {
  if (state.selected.has(id)) state.selected.delete(id)
  else state.selected.add(id)
  const idx = state.items.findIndex(it => it.id === id)
  const tile = idx >= 0 ? state.renderedTiles.get(idx) : null
  if (tile) tile.classList.toggle('selected', state.selected.has(id))
  // Auto-exit if user deselected the last item
  if (state.selected.size === 0 && state.selectMode) exitSelectMode()
  else updateSelectionUI()
}

function updateSelectionUI () {
  if (state.countEl) {
    state.countEl.textContent = state.selected.size + ' selected'
  }
  if (state.downloadBtn) state.downloadBtn.disabled = state.selected.size === 0
  if (state.selectAllBtn) {
    state.selectAllBtn.textContent =
      state.selected.size === state.items.length ? 'Deselect all' : 'Select all'
  }
}

function selectAllOrNone () {
  if (state.selected.size === state.items.length) {
    // Deselect all but keep select mode active
    for (const a of state.renderedTiles.values()) a.classList.remove('selected')
    state.selected.clear()
    updateSelectionUI()
  } else {
    if (!state.selectMode) enterSelectMode()
    for (const item of state.items) state.selected.add(item.id)
    for (const a of state.renderedTiles.values()) a.classList.add('selected')
    updateSelectionUI()
  }
}

/**
 * Send the current selection to the download endpoint. A single selection
 * downloads the asset directly (no one-entry zip); two or more selections
 * POST to /share/:key/download and the server streams a zip back.
 */
function downloadSelected () {
  if (state.selected.size === 0) return
  // Single selection: download the file directly so the user gets the image
  // (or video) instead of a one-entry zip.
  if (state.selected.size === 1) {
    const id = state.selected.values().next().value
    const item = state.items.find(it => it.id === id)
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
  input.value = JSON.stringify(Array.from(state.selected))
  form.appendChild(input)
  document.body.appendChild(form)
  form.submit()
  form.remove()
}

/**
 * Look up the selection toolbar in the DOM and wire its buttons (cancel,
 * select-all, download). Called once at init time. If the toolbar element
 * isn't on the page (the share doesn't allow downloads), this short-circuits
 * and selection-related code paths never activate.
 */
export function setupToolbar () {
  state.toolbarEl = document.getElementById('select-toolbar')
  // No toolbar means downloads aren't allowed for this share; nothing to wire
  if (!state.toolbarEl) return
  state.countEl = document.getElementById('select-count')
  state.selectAllBtn = document.getElementById('select-all') as HTMLButtonElement | null
  state.cancelBtn = document.getElementById('select-cancel') as HTMLButtonElement | null
  state.downloadBtn = document.getElementById('select-download') as HTMLButtonElement | null
  if (state.cancelBtn) state.cancelBtn.addEventListener('click', exitSelectMode)
  if (state.selectAllBtn) state.selectAllBtn.addEventListener('click', selectAllOrNone)
  if (state.downloadBtn) state.downloadBtn.addEventListener('click', downloadSelected)
  updateSelectionUI()
}
