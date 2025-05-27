import dayjs from 'dayjs'
import { Response } from 'express-serve-static-core'
import { DownloadAll, SharedLink } from './types'

let config = {}
try {
  const configJson = require(process.env.IPP_CONFIG || '../config.json')
  if (typeof configJson === 'object') config = configJson
} catch (e) { }

/**
 * Get a configuration option fron config.json using dotted notation.
 *
 * @param path
 * @param [defaultOption] - Specify a default option to return if no configuation value is found
 *
 * @example
 * getConfigOption('ipp.singleImageGallery')
 */
export const getConfigOption = (path: string, defaultOption?: unknown) => {
  const value = path.split('.').reduce((obj: { [key: string]: unknown }, key) => (obj || {})[key], config)
  if (value === undefined) {
    return defaultOption
  } else {
    return value
  }
}

/**
 * Output a console.log message with timestamp
 */
export const log = (message: string) => console.log(dayjs().format() + ' ' + message)

/**
 * Force a value to be a string
 */
export function toString (value: unknown) {
  return typeof value === 'string' ? value : ''
}

/**
 * Add response headers from config.json
 */
export function addResponseHeaders (res: Response) {
  Object.entries(getConfigOption('ipp.responseHeaders', {}) as { [key: string]: string })
    .forEach(([header, value]) => {
      res.set(header, value)
    })
}

export function canDownload (share: SharedLink) {
  const allowDownloadConfig = getConfigOption('ipp.allowDownloadAll', 0) as DownloadAll
  if (!allowDownloadConfig) {
    // Downloading is disabled in config.json
    return false
  } else if (allowDownloadConfig === DownloadAll.always) {
    // Always allowed to download in config.json
    return true
  } else {
    // Return Immich's setting for this shared link
    return !!share.allowDownload
  }
}
