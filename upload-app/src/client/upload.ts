// The upload page: the placeholder button and dropping files on the page
// feed one queue. Each file is its own request, so one failure is one file.
// The panel follows Immich's own upload panel: summary lines, then one row
// per file with a status icon, a progress bar while sending, and the error.
//
// Nothing here reads a file's contents; the bytes go straight from the File
// to the request body.

import { createLimiter } from '../shared/limiter.js'
import { fileType, formatSize, isUploadableName, isUploadableType } from '../shared/upload.js'
import type { UploadErrorResponse, UploadPageConfig, UploadResponse } from '../shared/upload.js'
import {
  ICON_ALERT_CIRCLE,
  ICON_CHECK_CIRCLE,
  ICON_CIRCLE_OUTLINE,
  ICON_CLOSE,
  ICON_LOADING,
  ICON_RESTART,
  iconSvg
} from '../shared/icons.js'

// Two at a time: enough to keep a phone's uplink busy without stalling every file behind one big video
const CONCURRENT_UPLOADS = 2
const ATTEMPTS = 3
const RETRY_BASE_MS = 2000
// A Retry-After longer than this is shown as a failure rather than waited out
const MAX_RETRY_WAIT_MS = 60_000

const config = JSON.parse(document.getElementById('upload-init')?.textContent || '{}') as UploadPageConfig
const run = createLimiter(CONCURRENT_UPLOADS)

const panelEl = document.getElementById('upload-panel') as HTMLElement
const progressEl = document.getElementById('upload-progress') as HTMLElement
const countsEl = document.getElementById('upload-counts') as HTMLElement
const noteEl = document.getElementById('upload-note') as HTMLElement
const listEl = document.getElementById('upload-list') as HTMLElement
const dropEl = document.getElementById('upload-drop') as HTMLElement

type RowState = 'pending' | 'started' | 'done' | 'duplicate' | 'error'

const STATE_ICONS: Record<RowState, string> = {
  pending: ICON_CIRCLE_OUTLINE,
  started: ICON_LOADING,
  done: ICON_CHECK_CIRCLE,
  duplicate: ICON_ALERT_CIRCLE,
  error: ICON_ALERT_CIRCLE
}

interface UploadRow {
  file: File
  type: string
  li: HTMLLIElement
  icon: HTMLElement
  action: HTMLButtonElement
  xhr?: XMLHttpRequest
  // Ends a retry wait early
  wake?: () => void
  cancelled: boolean
}

/*
  Counts for the batch on screen, as Immich shows them. Files added while a
  batch is still sending join it; the first file after a batch has finished
  starts a new one.
*/
const stats = { total: 0, remaining: 0, uploaded: 0, errors: 0, duplicates: 0 }

function updateSummary () {
  progressEl.textContent = `Remaining ${stats.remaining} - Processed ${stats.total - stats.remaining}/${stats.total}`
  countsEl.innerHTML = 'Uploaded <span class="upload-count-success"></span> - Errors <span class="upload-count-danger"></span> - Duplicates <span class="upload-count-warning"></span>'
  const [uploaded, errors, duplicates] = countsEl.querySelectorAll('span')
  uploaded.textContent = String(stats.uploaded)
  errors.textContent = String(stats.errors)
  duplicates.textContent = String(stats.duplicates)
  noteEl.hidden = stats.remaining > 0 || stats.uploaded === 0
}

function setState (row: UploadRow, state: RowState) {
  row.li.dataset.state = state
  row.icon.innerHTML = iconSvg(STATE_ICONS[state])
}

/** Swap the row's button: cancel while queued or sending, retry or dismiss afterwards. */
function setAction (row: UploadRow, kind: 'cancel' | 'retry' | 'dismiss') {
  const labels = { cancel: 'Cancel', retry: 'Retry', dismiss: 'Dismiss' }
  row.action.dataset.kind = kind
  row.action.setAttribute('aria-label', labels[kind] + ' ' + row.file.name)
  row.action.title = labels[kind]
  row.action.innerHTML = iconSvg(kind === 'retry' ? ICON_RESTART : ICON_CLOSE)
}

/** Remove any progress bar or error line under the row's main line. */
function clearDetail (row: UploadRow) {
  row.li.querySelector('.upload-row-detail')?.remove()
}

function showProgress (row: UploadRow, text: string, percent: number) {
  let bar = row.li.querySelector('.upload-row-detail.upload-bar') as HTMLElement | null
  if (!bar) {
    clearDetail(row)
    bar = document.createElement('div')
    bar.className = 'upload-row-detail upload-bar'
    bar.innerHTML = '<div class="upload-bar-fill"></div><p class="upload-bar-text"></p>'
    row.li.appendChild(bar)
  }
  const fill = bar.firstElementChild as HTMLElement
  const label = bar.lastElementChild as HTMLElement
  fill.style.width = percent + '%'
  label.textContent = text
}

function showError (row: UploadRow, message: string) {
  clearDetail(row)
  const p = document.createElement('p')
  p.className = 'upload-row-detail upload-row-error'
  p.textContent = message
  row.li.appendChild(p)
}

/** Record a finished row: its state, its counter, and the button it keeps. */
function finish (row: UploadRow, state: 'done' | 'duplicate' | 'error', message?: string, retryable = false) {
  setState(row, state)
  clearDetail(row)
  if (state === 'error') {
    stats.errors++
    if (message) showError(row, message)
  } else if (state === 'duplicate') {
    stats.duplicates++
  } else {
    stats.uploaded++
  }
  setAction(row, retryable ? 'retry' : 'dismiss')
}

/** Build the panel row for one file: status icon, name, and its button. */
function addRow (file: File, type: string): UploadRow {
  const li = document.createElement('li')
  li.className = 'upload-row'
  const line = document.createElement('div')
  line.className = 'upload-row-line'
  const icon = document.createElement('span')
  icon.className = 'upload-row-icon'
  const name = document.createElement('span')
  name.className = 'upload-row-name'
  name.textContent = file.name
  const action = document.createElement('button')
  action.type = 'button'
  action.className = 'upload-row-action'
  line.append(icon, name, action)
  li.appendChild(line)
  listEl.appendChild(li)

  const row: UploadRow = { file, type, li, icon, action, cancelled: false }
  setState(row, 'pending')
  setAction(row, 'cancel')
  action.addEventListener('click', () => {
    if (action.dataset.kind === 'retry') {
      // A retried file rejoins the batch on screen
      stats.errors--
      queue(row)
      return
    }
    // Cancel and dismiss both take the row away; a cancelled file is not counted
    if (action.dataset.kind === 'cancel') {
      row.cancelled = true
      row.xhr?.abort()
      row.wake?.()
    }
    li.remove()
  })
  return row
}

type Attempt =
  | { outcome: 'sent', duplicate: boolean }
  | { outcome: 'failed', message: string, retryable: boolean }
  | { outcome: 'retry', waitMs: number }
  | { outcome: 'cancelled' }

/** The visitor-facing reason for a refused upload. */
function failureMessage (xhr: XMLHttpRequest): string {
  let reply: Partial<UploadErrorResponse> | undefined
  try { reply = JSON.parse(xhr.responseText) } catch { }
  if (reply?.error) return reply.error
  // Not our JSON, so a proxy in front of the upload service answered
  if (xhr.status === 413) return 'Too large for this server'
  if (xhr.status === 404) return 'This share no longer accepts photos. Reload the page.'
  return 'Could not be sent'
}

/**
 * A refused upload, with whether another try could succeed: the service or
 * Immich is down, or a limit that lifts with time (the budget sends
 * `Retry-After`). A refused file or a closed share fails the same way every
 * time, so those rows get Dismiss rather than Retry.
 */
function failure (xhr: XMLHttpRequest): Attempt {
  const retryable = xhr.status >= 500 || xhr.getResponseHeader('Retry-After') !== null
  return { outcome: 'failed', message: failureMessage(xhr), retryable }
}

/** One request for one file. XHR rather than fetch, because only XHR reports upload progress. */
function attempt (row: UploadRow, attemptNumber: number): Promise<Attempt> {
  return new Promise(resolve => {
    const timestamp = new Date(row.file.lastModified || Date.now()).toISOString()
    const query = new URLSearchParams({ filename: row.file.name, fileCreatedAt: timestamp, fileModifiedAt: timestamp })
    const xhr = new XMLHttpRequest()
    row.xhr = xhr
    const started = Date.now()
    xhr.open('POST', config.uploadUrl + '?' + query.toString())
    xhr.setRequestHeader('Content-Type', row.type)
    xhr.upload.addEventListener('progress', e => {
      if (!e.lengthComputable) return
      const percent = Math.round((e.loaded / e.total) * 100)
      const seconds = (Date.now() - started) / 1000
      const speed = seconds > 0 ? e.loaded / seconds : 0
      const eta = speed > 0 ? Math.ceil((e.total - e.loaded) / speed) : 0
      showProgress(row, `${percent}% - ${formatSize(Math.round(speed))}/s - ${eta}s`, percent)
    })

    const backoff = { outcome: 'retry', waitMs: RETRY_BASE_MS * 2 ** (attemptNumber - 1) } as const
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let reply: Partial<UploadResponse> | undefined
        try { reply = JSON.parse(xhr.responseText) } catch { }
        resolve({ outcome: 'sent', duplicate: reply?.status === 'duplicate' })
      } else if (xhr.status === 429) {
        const seconds = Number(xhr.getResponseHeader('Retry-After'))
        resolve(Number.isFinite(seconds) && seconds > 0 ? { outcome: 'retry', waitMs: seconds * 1000 } : backoff)
      } else {
        resolve(failure(xhr))
      }
    })
    // A refusal that closes the connection mid-body often arrives as a network error
    xhr.addEventListener('error', () => resolve(backoff))
    xhr.addEventListener('abort', () => resolve({ outcome: 'cancelled' }))
    xhr.send(row.file)
  })
}

/** Wait before a retry; cancelling the row ends the wait. */
function waitToRetry (row: UploadRow, ms: number): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms)
    row.wake = () => {
      clearTimeout(timer)
      resolve()
    }
  })
}

/** Send one file, retrying a rate limit or a network error, and record the result on its row. */
async function sendFile (row: UploadRow) {
  for (let attemptNumber = 1; !row.cancelled; attemptNumber++) {
    setState(row, 'started')
    showProgress(row, '0%', 0)
    const result = await attempt(row, attemptNumber)
    if (result.outcome === 'cancelled') return
    if (result.outcome === 'sent') {
      finish(row, result.duplicate ? 'duplicate' : 'done')
      return
    }
    if (result.outcome === 'failed') {
      finish(row, 'error', result.message, result.retryable)
      return
    }
    if (attemptNumber >= ATTEMPTS || result.waitMs > MAX_RETRY_WAIT_MS) {
      finish(row, 'error', 'Could not be sent. Try again later.', true)
      return
    }
    setState(row, 'pending')
    showProgress(row, 'Waiting to retry', 0)
    await waitToRetry(row, result.waitMs)
  }
}

/** Start a new batch if the last one has finished. */
function startBatchIfIdle () {
  if (stats.remaining > 0) return
  stats.total = stats.uploaded = stats.errors = stats.duplicates = 0
}

/** Put a row in the send queue and count it as remaining. */
function queue (row: UploadRow) {
  row.cancelled = false
  setState(row, 'pending')
  setAction(row, 'cancel')
  clearDetail(row)
  stats.remaining++
  updateSummary()
  run(() => row.cancelled ? Promise.resolve() : sendFile(row)).finally(() => {
    stats.remaining--
    // A cancelled file leaves the batch altogether
    if (row.cancelled) stats.total--
    updateSummary()
  })
}

/** Queue files. Anything the server would refuse anyway is refused here, before it costs the visitor's uplink. */
function queueFiles (files: File[]) {
  if (!files.length) return
  startBatchIfIdle()
  panelEl.hidden = false
  for (const file of files) {
    const type = fileType(file.name, file.type)
    const row = addRow(file, type)
    stats.total++
    if (!isUploadableType(type) || !isUploadableName(file.name)) {
      finish(row, 'error', 'Only photos and videos can be sent')
    } else if (file.size > config.maxFileSize) {
      finish(row, 'error', 'Larger than the ' + formatSize(config.maxFileSize) + ' limit')
    } else {
      queue(row)
    }
  }
  updateSummary()
}

/**
 * Show the drop overlay while a drag carrying files is over the window.
 * `dragenter` and `dragleave` fire per element, so the depth counter stops
 * the overlay flickering as the pointer crosses child nodes.
 */
function setupDragAndDrop () {
  let depth = 0
  const carriesFiles = (e: DragEvent) => !!e.dataTransfer?.types?.includes('Files')
  const hide = () => {
    depth = 0
    dropEl.hidden = true
  }
  window.addEventListener('dragenter', e => {
    if (!carriesFiles(e)) return
    depth++
    dropEl.hidden = false
  })
  window.addEventListener('dragover', e => {
    // Without this the browser opens the dropped file instead
    if (carriesFiles(e)) e.preventDefault()
  })
  window.addEventListener('dragleave', () => {
    if (--depth <= 0) hide()
  })
  window.addEventListener('drop', e => {
    if (!carriesFiles(e)) return
    e.preventDefault()
    hide()
    queueFiles(Array.from(e.dataTransfer?.files || []))
  })
}

const input = document.getElementById('upload-input') as HTMLInputElement
document.getElementById('upload-choose')?.addEventListener('click', () => input.click())
input.addEventListener('change', () => {
  queueFiles(Array.from(input.files || []))
  // So picking the same file again still fires `change`
  input.value = ''
})
setupDragAndDrop()
