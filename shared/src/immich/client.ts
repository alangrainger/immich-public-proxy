import dayjs from 'dayjs'
import { ImmichVersion, KeyType } from '../types'
import { log } from '../utils/log'

/**
 * Make a request to Immich API. We're not using the SDK to limit
 * the possible attack surface of this app.
 */
export async function request (endpoint: string, init?: RequestInit) {
  try {
    const res = await fetch(apiUrl() + endpoint, init)
    if (res.status === 200) {
      const contentType = res.headers.get('Content-Type') || ''
      if (contentType.includes('application/json')) {
        return res.json()
      } else {
        return res
      }
    } else {
      log('Immich API status ' + res.status)
      console.log(await res.text())
    }
  } catch (e) {
    log('Unable to reach Immich on ' + process.env.IMMICH_URL)
    log(`From the container IPP is running in, run this and check you receive a JSON result: node -e "fetch('${apiUrl()}/server/ping').then(r => r.text()).then(console.log).catch(console.error)"`)
    log('Avoid testing with curl - curl uses its own DNS resolver and can succeed even when the resolver Node/IPP uses (musl getaddrinfo) fails. See https://github.com/alangrainger/immich-public-proxy/issues/263')
  }
}

export function apiUrl () {
  return (process.env.IMMICH_URL || '').replace(/\/*$/, '') + '/api'
}

/**
 * Build safely-encoded URL string.
 */
export function buildUrl (baseUrl: string, params: { [key: string]: string | undefined } = {}) {
  // Remove empty properties
  params = Object.fromEntries(Object.entries(params).filter(([_, value]) => !!value))
  let query = ''
  // Safely encode query parameters
  if (Object.entries(params).length) {
    query = '?' + (new URLSearchParams(params as {
      [key: string]: string
    })).toString()
  }
  return baseUrl + query
}

/**
 * Check if a provided ID matches the Immich ID format
 */
export function isId (id: string) {
  return !!id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
}

/**
 * Check if a provided key matches the Immich shared-link key format.
 * It appears that the key is always 67 chars long, but since I don't know that this
 * will always be the case, I've left it open-ended.
 */
export function isKey (key: string) {
  return !!key.match(/^[\w-]+$/)
}

/**
 * Map the URL path prefix (`share` or `s`) to the corresponding `KeyType`.
 */
export function getKeyTypeFromShare (shareType: string) {
  return shareType === 's' ? KeyType.slug : KeyType.key
}

/**
 * Reachability ping for the `/share/healthcheck` route.
 */
export async function accessible () {
  return !!(await request('/server/ping'))
}

// Minimum Immich server version IPP is compatible with
export const MIN_IMMICH_VERSION: ImmichVersion = { major: 2, minor: 0, patch: 0 }

const formatVersion = (v: ImmichVersion) => `${v.major}.${v.minor}.${v.patch}`

/**
 * Fetch the Immich server version from the public `/server/version` endpoint
 * (no auth required). Returns null if Immich is unreachable or the response
 * isn't the expected `{ major, minor, patch }` shape.
 */
export async function getImmichVersion (): Promise<ImmichVersion | null> {
  const res = await request('/server/version')
  if (res && typeof res.major === 'number' && typeof res.minor === 'number' && typeof res.patch === 'number') {
    return { major: res.major, minor: res.minor, patch: res.patch }
  }
  return null
}

/**
 * True if `version` is at least MIN_IMMICH_VERSION. A prerelease of the
 * minimum version (e.g. 3.0.0-beta) counts as supported.
 */
export function isImmichVersionSupported (version: ImmichVersion): boolean {
  if (version.major !== MIN_IMMICH_VERSION.major) return version.major > MIN_IMMICH_VERSION.major
  if (version.minor !== MIN_IMMICH_VERSION.minor) return version.minor > MIN_IMMICH_VERSION.minor
  return version.patch >= MIN_IMMICH_VERSION.patch
}

/**
 * Startup guard. If we can positively confirm the Immich server is older than
 * IPP supports, log and exit rather than silently serving broken album shares.
 * If the version can't be determined (Immich not yet reachable at boot, or an
 * unexpected response), log a warning and continue - a transient blip must not
 * crash-loop the container, and per-request handling still copes.
 */
export async function enforceMinimumImmichVersion (): Promise<void> {
  const version = await getImmichVersion()
  if (!version) {
    log('Could not determine the Immich server version. Check that Immich is reachable and running ' + formatVersion(MIN_IMMICH_VERSION) + ' or newer.')
    return
  }
  if (!isImmichVersionSupported(version)) {
    console.error(dayjs().format() + ' FATAL: Immich server is version ' + formatVersion(version) + ', but IPP requires Immich ' + formatVersion(MIN_IMMICH_VERSION) + ' or newer.')
    process.exit(1)
  }
}
