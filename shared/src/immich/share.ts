import dayjs from 'dayjs'
import { KeyType, SharedLink, SharedLinkResult } from '../types'
import { getConfigOption } from '../config/access'
import { log } from '../utils/log'
import { cachedPromise, TtlLruCache } from '../utils/ttlLruCache'
import { apiUrl, buildUrl } from './client'

/*
  Immich replaced the deprecated `?password=...` query-param auth for shared
  links with `POST /shared-links/login`, which returns an
  `immich_shared_link_token` cookie used on subsequent calls. This cache holds
  one such token per (keyType, key, password) so the gallery's many asset
  requests reuse a single login round-trip. Keying by password is load-bearing
  for security: a request without the correct password produces a different
  cache key (often empty) and falls through to a fresh login that Immich will
  reject - IPP never serves cached tokens to unauthenticated visitors.
*/
const tokenCache = new TtlLruCache<Promise<string | null>>({ ttlMs: 120_000, max: 100 })

/** Whether this is a slug link and the operator has turned slug links off. */
export function slugLinksDisabled (keyType: KeyType): boolean {
  return keyType === KeyType.slug && !getConfigOption('ipp.allowSlugLinks', true)
}

/**
 * Display title for a shared link. Prefers the user-set link description,
 * falls back to the album name (for album shares), or a generic placeholder.
 */
export function title (share: SharedLink): string {
  return share.description || share?.album?.albumName || 'Gallery'
}

/**
 * Fetch and interpret `GET /shared-links/me` for a key. Uncached: each app
 * wraps this with its own cache.
 *
 * On success the link carries `keyType` and `password`, and whatever `assets`
 * Immich sent - an empty array for album shares, which the caller enumerates
 * if it needs them. An expired link, an invalid key or an unexpected response
 * is `{ valid: false }`; a 401 for anything other than a bad key is
 * `passwordRequired`.
 */
export async function fetchSharedLink (key: string, keyType: KeyType = KeyType.key, password?: string): Promise<SharedLinkResult> {
  const url = buildUrl(apiUrl() + '/shared-links/me', {
    [keyType]: key
  })
  const headers = await authHeaders(keyType, key, password)
  const res = await fetch(url, { headers })
  if ((res.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    const jsonBody = await res.json()
    if (jsonBody) {
      if (res.status === 200) {
        const link = jsonBody as SharedLink
        link.keyType = keyType
        link.password = password
        if (link.expiresAt && dayjs(link.expiresAt) < dayjs()) {
          // This link has expired
          log('Expired link ' + key)
        } else {
          return {
            valid: true,
            link
          }
        }
      } else if (res.status === 401) {
        // Immich returns 401 for both invalid keys and password-protected shares.
        // Check the message to distinguish between the two cases.
        if (jsonBody?.message === 'Invalid share key' || jsonBody?.message === 'Invalid share slug') {
          // Known invalid key/slug - treat as invalid request
          log('Invalid share key ' + key)
        } else {
          // Default: treat as password required (fail-safe)
          return {
            valid: true,
            passwordRequired: true
          }
        }
      } else {
        console.log(JSON.stringify(jsonBody))
      }
    }
  } else {
    // Otherwise return failure
    log('Immich response ' + res.status + ' for key ' + key)
    try {
      console.log(res.headers.get('Content-Type'))
      console.log((await res.text()).slice(0, 500))
      log('Unexpected response from Immich API at ' + apiUrl())
      log('Please make sure the IPP container is able to reach this path.')
    } catch (e) {
      console.log(e)
    }
  }
  return {
    valid: false
  }
}

/**
 * Build the `Cookie` header that authenticates to Immich for a
 * password-protected share. Returns `{}` (no Cookie header) when the share
 * has no password or login failed; in those cases Immich will respond 401
 * for protected resources, which the caller handles as "password required".
 */
export async function authHeaders (keyType: KeyType, key: string, password?: string): Promise<Record<string, string>> {
  if (!password) return {}
  const token = await getSharedLinkToken(key, password, keyType)
  return token ? { Cookie: `immich_shared_link_token=${token}` } : {}
}

/**
 * Cached login: fetch an `immich_shared_link_token` for the given password,
 * or return null on failure. The cache is per (keyType, key, password) so
 * that a request without the correct password can't reuse another visitor's
 * authenticated session. See `tokenCache` doc-comment for the security
 * argument.
 */
function getSharedLinkToken (key: string, password: string, keyType: KeyType): Promise<string | null> {
  const cacheKey = `${keyType}:${key}:${password}`
  // Default eviction (falsy is invalid) drops a null/empty token, so a failed
  // login is never cached.
  return cachedPromise(tokenCache, cacheKey, () => sharedLinkLogin(key, password, keyType))
}

/**
 * `POST /shared-links/login`. Replaces the deprecated `?password=...` query
 * param. Returns the cookie value on success, null on any failure.
 */
async function sharedLinkLogin (key: string, password: string, keyType: KeyType): Promise<string | null> {
  const url = buildUrl(apiUrl() + '/shared-links/login', { [keyType]: key })
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    if (res.status !== 201) return null
    const setCookie = res.headers.get('set-cookie') || ''
    const match = setCookie.match(/immich_shared_link_token=([^;,]+)/)
    return match ? match[1] : null
  } catch (e) {
    return null
  }
}
