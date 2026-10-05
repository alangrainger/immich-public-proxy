import { join } from 'path'
import { resolveAppVersion } from '@ipp/core'

/** URL-safe cache-busting segment for static asset paths. */
export const ASSET_VERSION = encodeURIComponent(resolveAppVersion(join(__dirname, '..', 'package.json')))
