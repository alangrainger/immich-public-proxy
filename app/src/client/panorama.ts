// 360 viewer for equirectangular panoramas: a toolbar button on panorama slides
// (and, with ipp.lightbox.panoramaAutoOpen, an automatic open) that covers the
// lightbox with a Pannellum view. The view adds a spin-speed button, a
// little-planet mode (planet.ts), previous / next, download and a clean view.
// Pannellum is vendored and loaded on first use, so galleries without a
// panorama never fetch it.

import { state } from './state.js'
import { createPlanet, Planet } from './planet.js'
import type { GalleryItem } from '../shared/types.js'

interface PannellumViewer {
  destroy: () => void
  resize: () => void
  startAutoRotate: (speed: number, pitch?: number) => void
  stopAutoRotate: () => void
  getPitch: () => number
  getConfig: () => { autoRotate?: number | false }
  on: (event: string, cb: () => void) => void
}

interface PswpInstance {
  currIndex: number
  next: () => void
  prev: () => void
  on: (event: string, cb: () => void) => void
  ui: { registerElement: (config: Record<string, unknown>) => void }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LightboxInstance = any

const pannellumGlobal = () => (window as unknown as {
  pannellum: { viewer: (el: HTMLElement, config: Record<string, unknown>) => PannellumViewer }
}).pannellum

// Degrees per second, negative turns left like Pannellum's own auto-rotate
const SPIN_LEVELS: Array<[string, number]> = [['Off', 0], ['Slow', -2], ['Medium', -6], ['Fast', -14]]
// Pannellum stops spinning on touch; the view resumes after this long without input
const IDLE_MS = 4000

let spinLevel = 1
let loading: Promise<void> | null = null
let openView: { close: (dismiss: boolean) => void } | null = null
// The panorama the visitor closed the viewer on, so auto-open leaves it alone
let dismissed: GalleryItem | undefined

function loadPannellum (): Promise<void> {
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = '/share/static/pannellum/pannellum.css'
      document.head.appendChild(css)
      const script = document.createElement('script')
      script.src = '/share/static/pannellum/pannellum.js'
      script.onload = () => resolve()
      script.onerror = () => {
        loading = null
        reject(new Error('Pannellum failed to load'))
      }
      document.head.appendChild(script)
    })
  }
  return loading
}

function element<K extends keyof HTMLElementTagNameMap> (tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  el.className = className
  if (text) el.textContent = text
  return el
}

function toolButton (text: string, label: string): HTMLButtonElement {
  const button = element('button', 'ipp-panorama__btn', text)
  button.type = 'button'
  button.title = label
  button.setAttribute('aria-label', label)
  return button
}

function open (pswp: PswpInstance, item: GalleryItem): void {
  if (openView) return

  const root = element('div', 'ipp-panorama')
  const view = element('div', 'ipp-panorama__view')
  const canvas = element('canvas', 'ipp-panorama__planet')
  const tools = element('div', 'ipp-panorama__tools')
  const prev = toolButton('◀', 'Previous photo')
  const next = toolButton('▶', 'Next photo')
  const spin = toolButton('', 'Spin speed')
  const planetButton = toolButton('Planet', 'Little planet view')
  const hide = toolButton('Hide UI', 'Hide the controls')
  const close = toolButton('Close', 'Close the 360 view')
  hide.classList.add('ipp-panorama__keep')
  prev.hidden = pswp.currIndex <= 0
  next.hidden = pswp.currIndex >= state.items.length - 1
  tools.append(prev, next, spin)
  tools.append(planetButton)
  if (state.lightboxConfig.showDownload && item.downloadUrl) {
    const download = element('a', 'ipp-panorama__btn', 'Download')
    download.href = item.downloadUrl
    download.download = item.downloadFilename
    tools.append(download)
  }
  tools.append(hide, close)
  root.append(view, canvas, tools)
  document.body.appendChild(root)

  const speed = () => SPIN_LEVELS[spinLevel][1]
  const labelSpin = () => { spin.textContent = 'Spin: ' + SPIN_LEVELS[spinLevel][0] }
  labelSpin()

  let pano: PannellumViewer | null = null
  let planet: Planet | null = null
  let planetShown = false
  let pointerDown = false
  let lastInput = Date.now()
  let timer = 0

  const url = item.fullUrl || item.previewUrl
  const start = (panorama: string) => {
    const config: Record<string, unknown> = {
      type: 'equirectangular',
      panorama,
      autoLoad: true,
      hfov: 100,
      minHfov: 30,
      maxHfov: 120,
      orientationOnByDefault: false
    }
    if (panorama !== item.previewUrl) config.preview = item.previewUrl
    if (speed()) config.autoRotate = speed()
    pano = pannellumGlobal().viewer(view, config)
    // The full-size image can be refused (e.g. share download off); the preview always loads
    pano.on('error', () => {
      if (panorama === item.previewUrl) return
      pano?.destroy()
      start(item.previewUrl)
    })
  }

  const finish = (dismiss: boolean) => {
    if (openView?.close !== finish) return
    window.clearInterval(timer)
    window.removeEventListener('keydown', onKey, true)
    planet?.destroy()
    pano?.destroy()
    root.remove()
    openView = null
    if (dismiss) dismissed = item
  }
  const step = (go: () => void) => {
    finish(true)
    go()
  }
  // Capture phase, so PhotoSwipe's own Escape and arrow handling does not also fire
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    e.stopImmediatePropagation()
    if (e.key === 'Escape') finish(true)
    else if (e.key === 'ArrowLeft' && !prev.hidden) step(() => pswp.prev())
    else if (e.key === 'ArrowRight' && !next.hidden) step(() => pswp.next())
  }

  openView = { close: finish }
  window.addEventListener('keydown', onKey, true)
  pswp.on('close', () => finish(false))

  for (const type of ['pointerdown', 'pointerup', 'wheel', 'touchstart', 'touchend']) {
    root.addEventListener(type, () => { lastInput = Date.now() })
  }
  root.addEventListener('pointerdown', () => { pointerDown = true })
  root.addEventListener('pointerup', () => { pointerDown = false })
  root.addEventListener('pointercancel', () => { pointerDown = false })

  prev.onclick = () => step(() => pswp.prev())
  next.onclick = () => step(() => pswp.next())
  close.onclick = () => finish(true)
  hide.onclick = () => {
    const clean = root.classList.toggle('ipp-panorama--clean')
    hide.textContent = clean ? 'Show UI' : 'Hide UI'
  }
  spin.onclick = () => {
    spinLevel = (spinLevel + 1) % SPIN_LEVELS.length
    labelSpin()
    if (planetShown || !pano) return
    if (speed()) pano.startAutoRotate(speed(), pano.getPitch())
    else pano.stopAutoRotate()
  }
  planetButton.onclick = () => {
    if (!planetShown && !planet) {
      planet = createPlanet(canvas, url, speed, IDLE_MS)
      if (!planet) {
        planetButton.hidden = true
        return
      }
    }
    planetShown = !planetShown
    planetButton.classList.toggle('ipp-panorama__btn--on', planetShown)
    view.style.display = planetShown ? 'none' : ''
    if (planetShown) {
      pano?.stopAutoRotate()
      planet?.show()
    } else {
      planet?.hide()
      pano?.resize()
      lastInput = Date.now()
    }
  }

  timer = window.setInterval(() => {
    if (!pano || !speed() || planetShown || pointerDown || pano.getConfig().autoRotate) return
    if (Date.now() - lastInput > IDLE_MS) pano.startAutoRotate(speed(), pano.getPitch())
  }, 1000)

  loadPannellum().then(() => {
    if (openView && root.isConnected) start(url)
  }).catch(() => finish(true))
}

/**
 * Register the 360 toolbar button. It hides itself on slides that are not
 * panoramas. With `ipp.lightbox.panoramaAutoOpen` the viewer also opens by
 * itself when a panorama slide is shown, including after a lazy album item's
 * detail arrives. Closing the viewer keeps it closed for that slide until the
 * visitor moves on and comes back.
 */
export function registerPanorama (lightbox: LightboxInstance): void {
  lightbox.on('beforeOpen', () => { dismissed = undefined })
  lightbox.on('uiRegister', () => {
    lightbox.pswp.ui.registerElement({
      name: 'panorama-button',
      order: 5,
      isButton: true,
      html: '<span class="ipp-panorama__label">360</span>',
      onInit: (el: HTMLElement, pswp: PswpInstance) => {
        const update = () => {
          const item = state.items[pswp.currIndex]
          el.hidden = !item?.panorama
          el.setAttribute('aria-label', '360 view')
          el.setAttribute('title', '360 view')
          if (item?.panorama && item !== dismissed && state.lightboxConfig.panoramaAutoOpen) open(pswp, item)
        }
        el.addEventListener('click', () => {
          const item = state.items[pswp.currIndex]
          if (item?.panorama) open(pswp, item)
        })
        pswp.on('change', () => {
          if (state.items[pswp.currIndex] !== dismissed) dismissed = undefined
          update()
        })
        state.slideRefreshers.push(update)
        update()
      }
    })
  })
}
