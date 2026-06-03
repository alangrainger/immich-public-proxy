import { readFileSync } from 'fs'
import { resolve } from 'path'
import { applyMigrations } from './migrations'

export type Config = Record<string, unknown>

// Module-level cache populated by `loadConfig()`. Access through
// `getCurrentConfig()` rather than importing directly; that gives
// `config/access.ts` a stable read path even before `loadConfig()` has
// been called (returning an empty object so calls fall back to defaults).
let currentConfig: Config = {}

/**
 * Read the runtime configuration from `process.env.CONFIG` (an inline JSON
 * string, typically set in docker-compose) or from the config file. Applies
 * backward-compatibility migrations, caches the result, and returns it.
 *
 * Called once from `index.ts` at startup. Safe to call again in tests with
 * a fresh env to reset state.
 */
export function loadConfig (): Config {
  let config: Config = {}
  try {
    if (process.env.CONFIG) {
      // Attempt to parse docker-compose config string into JSON (if specified)
      config = JSON.parse(process.env.CONFIG)
    } else {
      // Default config.json sits one level above the compiled dist/ output.
      // IPP_CONFIG (if set) is taken as-is for absolute paths, or resolved
      // against the current working directory for relative paths.
      const configPath = process.env.IPP_CONFIG
        ? resolve(process.env.IPP_CONFIG)
        : resolve(__dirname, '../../config.json')
      const configJson = JSON.parse(readFileSync(configPath, 'utf8'))
      if (typeof configJson === 'object') config = configJson
    }
  } catch (e) {
    console.log(e)
  }

  applyMigrations(config)
  currentConfig = config
  return config
}

/**
 * Return the most recently loaded config, or an empty object if
 * `loadConfig()` hasn't been called yet. Used by `getConfigOption`.
 */
export function getCurrentConfig (): Config {
  return currentConfig
}
