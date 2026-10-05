import { describe, it, expect, vi, afterEach } from 'vitest'
import { createWindowBudget } from '../src/limits'

afterEach(() => {
  vi.useRealTimers()
})

describe('createWindowBudget as a rate limit', () => {
  it('admits up to the limit, then refuses with the seconds left in the window', () => {
    vi.useFakeTimers()
    const rate = createWindowBudget({ limit: 3, windowMs: 60_000 })
    expect([1, 2, 3].map(() => rate('ip:share').ok)).toEqual([true, true, true])
    vi.advanceTimersByTime(20_000)
    expect(rate('ip:share')).toEqual({ ok: false, retryAfterSeconds: 40 })
  })

  it('counts only admitted requests', () => {
    const rate = createWindowBudget({ limit: 1, windowMs: 60_000 })
    rate('a')
    rate('a')
    rate('a')
    expect(rate('b').ok).toBe(true)
  })

  it('starts a fresh window once the old one has passed', () => {
    vi.useFakeTimers()
    const rate = createWindowBudget({ limit: 1, windowMs: 60_000 })
    expect(rate('a').ok).toBe(true)
    expect(rate('a').ok).toBe(false)
    vi.advanceTimersByTime(60_000)
    expect(rate('a').ok).toBe(true)
  })

  it('treats a limit of 0 as no limit', () => {
    const rate = createWindowBudget({ limit: 0, windowMs: 60_000 })
    expect([1, 2, 3, 4].every(() => rate('a').ok)).toBe(true)
  })
})

describe('createWindowBudget as a byte budget', () => {
  it('reserves on admission, so parallel uploads cannot overshoot together', () => {
    const budget = createWindowBudget({ limit: 100, windowMs: 3_600_000 })
    expect(budget('share', 60).ok).toBe(true)
    expect(budget('share', 60).ok).toBe(false)
    expect(budget('share', 40).ok).toBe(true)
  })

  it('gives a failed upload\'s reservation back, once', () => {
    const budget = createWindowBudget({ limit: 100, windowMs: 3_600_000 })
    const first = budget('share', 80)
    expect(budget('share', 80).ok).toBe(false)
    if (first.ok) {
      first.release()
      first.release()
    }
    expect(budget('share', 80).ok).toBe(true)
    expect(budget('share', 80).ok).toBe(false)
  })

  it('ignores a release after its window has closed', () => {
    vi.useFakeTimers()
    const budget = createWindowBudget({ limit: 100, windowMs: 1000 })
    const old = budget('share', 100)
    vi.advanceTimersByTime(1000)
    expect(budget('share', 100).ok).toBe(true)
    if (old.ok) old.release()
    expect(budget('share', 1).ok).toBe(false)
  })
})
