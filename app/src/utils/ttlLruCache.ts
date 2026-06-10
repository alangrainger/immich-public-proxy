/*
  Time-to-live + size-bounded LRU cache. Used by `immich.ts` to memoise
  share-link lookups and `POST /shared-links/login` tokens, where:

  - TTL gives us freshness without rebuilding share state on every asset
    request.
  - LRU + size cap keeps memory bounded under a wide key space (one entry
    per `(keyType, key, password)` combination).
  - Move-to-end on `get` makes "recently accessed" stay alive across
    bursts and lets long-tail keys age out.

  The cache is intentionally storage-only. Callers handle the "should this
  value stay cached?" decision after the underlying fetch resolves (e.g.
  delete on null result, delete on rejection). Keeping that policy at the
  call site means we don't bake validation rules into a generic cache.
*/

interface Entry<V> {
  value: V
  expiresAt: number
}

export class TtlLruCache<V> {
  private readonly entries = new Map<string, Entry<V>>()
  private readonly ttlMs: number
  private readonly max: number

  constructor (opts: { ttlMs: number, max: number }) {
    this.ttlMs = opts.ttlMs
    this.max = opts.max
  }

  /**
   * Get the value for `key`, refreshing its LRU position. Returns
   * `undefined` if the entry is missing or expired (expired entries are
   * dropped on access).
   */
  get (key: string): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    // Move-to-end so LRU eviction drops the least recently accessed.
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  /**
   * Insert or replace `key` with `value` and a fresh TTL. Evicts the
   * oldest entry when the cache exceeds its size cap (unless the oldest
   * is the entry we just wrote, which shouldn't happen but is guarded
   * just in case).
   */
  set (key: string, value: V): void {
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs })
    if (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined && oldest !== key) this.entries.delete(oldest)
    }
  }

  delete (key: string): void {
    this.entries.delete(key)
  }
}
