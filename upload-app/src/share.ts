import { cachedPromise, fetchSharedLink, KeyType, SharedLinkResult, TtlLruCache } from '@ipp/core'

/*
  Share lookups, cached for 60 s per (key type, key, password). The cache
  bounds how stale the `allowUpload` check can be when an owner turns the
  toggle off; Immich enforces the toggle on every upload regardless.
*/
const shareCache = new TtlLruCache<Promise<SharedLinkResult>>({ ttlMs: 60_000, max: 100 })

/** Look up a share through `@ipp/core`, sharing one Immich call across concurrent requests. */
export function getShare (key: string, keyType: KeyType, password?: string): Promise<SharedLinkResult> {
  return cachedPromise(shareCache, `${keyType}:${key}:${password || ''}`, () => fetchSharedLink(key, keyType, password), result => result.valid)
}
