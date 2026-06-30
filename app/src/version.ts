import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Resolve the running application version. Prefers the APP_VERSION env var
 * baked in at Docker build time (see Dockerfile); falls back to package.json
 * for local dev (`npm run dev`), and finally to 'dev' if neither is readable.
 */
function resolveVersion (): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))
    return pkg.version || 'dev'
  } catch {
    return 'dev'
  }
}

export const APP_VERSION = resolveVersion()

/** URL-safe cache-busting segment for static asset paths. */
export const ASSET_VERSION = encodeURIComponent(APP_VERSION)
