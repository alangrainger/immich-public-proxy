import { TtlLruCache } from '@ipp/core'

export type Admission =
  | { ok: true, release: () => void }
  | { ok: false, retryAfterSeconds: number }

interface Window {
  used: number
  resetAt: number
}

/**
 * Fixed-window budget: each key may admit up to `limit` units per window.
 * The rate limit admits one unit per file; the byte budget admits a file's
 * declared length, and releases it if the upload then fails.
 *
 * Backed by TtlLruCache, so a flood of distinct keys evicts instead of
 * growing without limit. The window lives on the entry rather than on the
 * cache TTL, so admitting inside a window never extends it. A `limit` of 0
 * or less means no limit.
 */
export function createWindowBudget (opts: { limit: number, windowMs: number, maxKeys?: number }): (key: string, amount?: number) => Admission {
  const windows = new TtlLruCache<Window>({
    // Twice the window, so the cache never drops an entry while its window is open
    ttlMs: opts.windowMs * 2,
    max: opts.maxKeys ?? 5000
  })
  const unlimited: Admission = { ok: true, release: () => {} }

  return function admit (key: string, amount = 1): Admission {
    if (opts.limit <= 0) return unlimited
    const now = Date.now()
    let window = windows.get(key)
    if (!window || window.resetAt <= now) {
      window = { used: 0, resetAt: now + opts.windowMs }
      windows.set(key, window)
    }
    if (window.used + amount > opts.limit) {
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)) }
    }
    window.used += amount
    const admitted = window
    let released = false
    return {
      ok: true,
      release: () => {
        // A release after its window closed has nothing left to give back
        if (released || admitted.resetAt <= Date.now()) return
        released = true
        admitted.used -= amount
      }
    }
  }
}
