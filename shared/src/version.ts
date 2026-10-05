import { readFileSync } from 'fs'

/**
 * Resolve the running application version. Prefers the APP_VERSION env var
 * baked in at Docker build time (see the Dockerfiles); falls back to the
 * app's package.json for local dev, and finally to 'dev' if neither is readable.
 */
export function resolveAppVersion (packageJsonPath: string): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION
  try {
    return JSON.parse(readFileSync(packageJsonPath, 'utf-8')).version || 'dev'
  } catch {
    return 'dev'
  }
}
