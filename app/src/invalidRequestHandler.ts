/*
This function is in its own file so that *if desired* someone can replace the entire
function with their own custom one, by replacing the invalidRequestHandler.js file
through a Docker volume mount.
 */

import { Response } from 'express-serve-static-core'
import { getConfigOption } from './config/access'
import { log } from './utils/log'

/**
 * Respond to any request that IPP would otherwise serve content for but cannot
 * (bad share key, password failure, unknown asset, etc.). Behavior is driven
 * by `ipp.customInvalidResponse` config; if unset, falls back to
 * `defaultResponse` (typically 404).
 *
 * Accepted values for the configured response (and `defaultResponse`):
 *   - `number` - HTTP status code to send with an empty body.
 *   - `null`   - drop the TCP connection without sending anything.
 *   - `string` starting with `http` - 302 redirect to that URL.
 *   - anything else - send an empty 404 (the ultimate fallback).
 *
 * Operators can replace this file entirely via a Docker volume mount to
 * customise the behavior; the function signature is the public contract.
 */
export function respondToInvalidRequest (res: Response, defaultResponse: number | string | null, logMessage = '') {
  let method = getConfigOption('ipp.customInvalidResponse', false)
  if (method === false) {
    // No custom method specified, use the default
    method = defaultResponse
  }
  logMessage = logMessage ? ' - ' + logMessage : ''

  if (typeof method === 'number') {
    // Respond with an HTTP status code
    log('Return status ' + method + logMessage)
    res.status(method).send()
  } else if (method === null) {
    // Drop the connection without responding
    log('Dropping connection' + logMessage)
    res.destroy()
  } else if (typeof method === 'string' && method.startsWith('http')) {
    // Redirect to another URL
    res.redirect(method)
  } else {
    // Fallback to 404
    log('Return status 404' + logMessage)
    res.status(404).send()
  }
}
