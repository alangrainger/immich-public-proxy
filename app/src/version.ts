import { join } from 'path'
import { resolveAppVersion } from '@ipp/core'

export const APP_VERSION = resolveAppVersion(join(__dirname, '..', 'package.json'))

/** URL-safe cache-busting segment for static asset paths. */
export const ASSET_VERSION = encodeURIComponent(APP_VERSION)
