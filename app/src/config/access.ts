import { getCurrentConfig } from './loader'

/**
 * Read a configuration option using dotted notation. Returns `defaultOption`
 * when the path doesn't resolve to a value.
 *
 * @example
 *   getConfigOption('ipp.gallery.singleImage', false)
 */
export function getConfigOption (path: string, defaultOption?: unknown) {
  const value = path.split('.').reduce(
    (obj: { [key: string]: unknown }, key) => (obj || {})[key] as { [key: string]: unknown },
    getCurrentConfig() as { [key: string]: unknown }
  )
  if (value === undefined) {
    return defaultOption
  }
  return value
}
