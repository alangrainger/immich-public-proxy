// Justified-rows + square-grid layout, with optional month grouping. Pure
// geometry: takes a container width, returns positions for every tile and
// every header. Called by virtualisation on first render and on resize.

import {
  state,
  TARGET_ROW_HEIGHT,
  GAP,
  MOBILE_BREAKPOINT,
  MOBILE_COLS,
  HEADER_HEIGHT,
  GROUP_GAP,
  type LayoutEntry,
  type HeaderEntry,
  type GroupSpec
} from './state.js'

export interface LayoutResult {
  layout: LayoutEntry[]
  headers: HeaderEntry[]
  totalHeight: number
}

/**
 * Compute tile positions, group-header positions, and total scroll height
 * for the gallery at the given container width.
 *
 * Reads `state.items` and `state.groupByDate`. Output is pure data - the
 * caller (virtualisation) is responsible for actually placing DOM nodes
 * according to the returned positions.
 *
 * Switches between a mobile square grid (under MOBILE_BREAKPOINT) and the
 * justified-rows algorithm. When grouping by date is enabled, items are
 * bucketed by YYYY-MM and a header is reserved before each group.
 */
export function computeLayout (containerW: number): LayoutResult {
  const tileLayout: LayoutEntry[] = new Array(state.items.length)
  const newHeaders: HeaderEntry[] = []
  const groups: GroupSpec[] = state.groupByDate
    ? groupItemsByMonth()
    : [{ label: null, indices: itemIndices() }]
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

function itemIndices (): number[] {
  const out = new Array(state.items.length)
  for (let i = 0; i < state.items.length; i++) out[i] = i
  return out
}

function groupItemsByMonth (): GroupSpec[] {
  // Preserve item order (already sorted desc by render.ts when grouping is on)
  const map = new Map<string, GroupSpec>()
  for (let i = 0; i < state.items.length; i++) {
    const key = (state.items[i].fileCreatedAt || '').slice(0, 7) || 'undated'
    let g = map.get(key)
    if (!g) {
      g = { label: monthLabel(key), indices: [] }
      map.set(key, g)
    }
    g.indices.push(i)
  }
  return Array.from(map.values())
}

function monthLabel (key: string): string {
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
 * Lay out one group as a fixed-column square grid (mobile path).
 * Writes positions into `tileLayout` in place.
 *
 * @returns The y position past the last tile in this group (no trailing gap).
 */
function layoutSquareGroup (containerW: number, indices: number[], startY: number, tileLayout: LayoutEntry[]): number {
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

/**
 * Lay out one group as justified rows (desktop path): tiles in each row are
 * scaled so their combined width fills the container exactly. The final row
 * keeps the target height instead of stretching to fill, which avoids the
 * "huge last row" look when there are only one or two trailing tiles.
 *
 * @returns The y position past the last tile in this group (no trailing gap).
 */
function layoutJustifiedGroup (containerW: number, indices: number[], startY: number, tileLayout: LayoutEntry[]): number {
  let rowItems: Array<{ idx: number, aspect: number }> = []
  let aspectSum = 0
  let y = startY

  const applyRow = (rowItems: Array<{ idx: number, aspect: number }>, height: number, isLastRow: boolean) => {
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
    const item = state.items[idx]
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
