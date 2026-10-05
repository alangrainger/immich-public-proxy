import { Response } from 'express-serve-static-core'
import { getConfigOption } from './config/access'
import { log } from './utils/log'

/** The public contract of a 404 handler, kept stable for operator replacements. */
export type InvalidRequestHandler = (res: Response, defaultResponse: number | string | null, logMessage?: string) => void

/**
 * Respond to any request that the app would otherwise serve content for but
 * cannot (bad share key, password failure, unknown asset, etc.). Behavior is
 * driven by `ipp.customInvalidResponse` config; if unset, falls back to
 * `defaultResponse` (typically 404).
 *
 * Accepted values for the configured response (and `defaultResponse`):
 *   - `number` - HTTP status code to send with an empty body.
 *   - `null`   - drop the TCP connection without sending anything.
 *   - `string` starting with `http` - 302 redirect to that URL.
 *   - anything else - send an empty 404 (the ultimate fallback).
 *
 * IPP ships the same logic in `app/src/invalidRequestHandler.ts`, which
 * operators may replace by a volume mount, and registers it at startup. Keep
 * the two in step.
 */
export const defaultInvalidRequestHandler: InvalidRequestHandler = (res, defaultResponse, logMessage = '') => {
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

let handler: InvalidRequestHandler = defaultInvalidRequestHandler

/**
 * Replace the handler that `respondToInvalidRequest` calls. Each app calls
 * this once at startup if it ships its own handler file.
 */
export function setInvalidRequestHandler (fn: InvalidRequestHandler): void {
  handler = fn
}

/**
 * Answer an invalid request through the registered handler. Every caller, in
 * core and in the apps, goes through here so a replacement applies everywhere.
 */
export function respondToInvalidRequest (res: Response, defaultResponse: number | string | null, logMessage = ''): void {
  handler(res, defaultResponse, logMessage)
}
