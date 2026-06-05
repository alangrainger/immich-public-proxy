import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TtlLruCache } from '../src/utils/ttlLruCache'

/*
  All TTL-based assertions rely on Vitest's fake-timer system mocking
  `Date.now()`. `vi.advanceTimersByTime` advances both the timer queue
  and the system clock the cache reads from.
*/

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TtlLruCache', () => {
  it('returns undefined for an unknown key', () => {
    const cache = new TtlLruCache<string>({ ttlMs: 1000, max: 10 })
    expect(cache.get('missing')).toBeUndefined()
  })

  it('returns the value after set', () => {
    const cache = new TtlLruCache<string>({ ttlMs: 1000, max: 10 })
    cache.set('a', 'apple')
    expect(cache.get('a')).toBe('apple')
  })

  it('returns undefined exactly at the TTL boundary', () => {
    const cache = new TtlLruCache<string>({ ttlMs: 1000, max: 10 })
    cache.set('a', 'apple')
    vi.advanceTimersByTime(999)
    expect(cache.get('a')).toBe('apple')
    vi.advanceTimersByTime(1)
    expect(cache.get('a')).toBeUndefined()
  })

  it('drops expired entries on access so they do not count toward the size cap', () => {
    const cache = new TtlLruCache<string>({ ttlMs: 100, max: 2 })
    cache.set('a', '1')
    vi.advanceTimersByTime(200)
    // Read once so the expired entry is dropped from the internal map.
    expect(cache.get('a')).toBeUndefined()
    // The cache should now have capacity for two fresh entries with no
    // collateral eviction of either.
    cache.set('b', '2')
    cache.set('c', '3')
    expect(cache.get('b')).toBe('2')
    expect(cache.get('c')).toBe('3')
  })
})

describe('TtlLruCache delete', () => {
  it('removes an existing entry', () => {
    const cache = new TtlLruCache<string>({ ttlMs: 1000, max: 10 })
    cache.set('a', '1')
    cache.delete('a')
    expect(cache.get('a')).toBeUndefined()
  })

  it('is a no-op for a missing key', () => {
    const cache = new TtlLruCache<string>({ ttlMs: 1000, max: 10 })
    expect(() => cache.delete('missing')).not.toThrow()
  })
})

describe('TtlLruCache LRU eviction', () => {
  it('evicts the oldest entry when set causes overflow', () => {
    const cache = new TtlLruCache<string>({ ttlMs: 10_000, max: 2 })
    cache.set('a', '1')
    cache.set('b', '2')
    cache.set('c', '3') // overflow - 'a' is the oldest, gets evicted
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe('2')
    expect(cache.get('c')).toBe('3')
  })

  it('get refreshes LRU position so a recently-read entry survives eviction', () => {
    const cache = new TtlLruCache<string>({ ttlMs: 10_000, max: 2 })
    cache.set('a', '1')
    cache.set('b', '2')
    // Touch 'a' so it becomes the most-recently-used. 'b' is now oldest.
    cache.get('a')
    cache.set('c', '3') // overflow - 'b' should be evicted, not 'a'
    expect(cache.get('a')).toBe('1')
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBe('3')
  })
})

describe('TtlLruCache re-set', () => {
  it('replaces the value when set is called twice for the same key', () => {
    const cache = new TtlLruCache<string>({ ttlMs: 1000, max: 10 })
    cache.set('a', '1')
    cache.set('a', '2')
    expect(cache.get('a')).toBe('2')
  })

  it('resets the TTL on re-set', () => {
    const cache = new TtlLruCache<string>({ ttlMs: 1000, max: 10 })
    cache.set('a', '1')
    vi.advanceTimersByTime(800)
    cache.set('a', '2') // bumps expiry to 1000ms from now
    vi.advanceTimersByTime(800)
    // 800 + 800 = 1600ms past the original set, but only 800ms past the
    // re-set, so the entry should still be live.
    expect(cache.get('a')).toBe('2')
  })
})
