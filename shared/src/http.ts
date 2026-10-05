import { NextFunction, Request, Response } from 'express-serve-static-core'
import { resolve } from 'path'
import { getConfigOption } from './config/access'

/** Static assets both apps serve from core: pico, the Inter font, the favicon and theme.css. */
export const CORE_PUBLIC_DIR = resolve(__dirname, '../public')

/**
 * Apply the response headers configured under `ipp.responseHeaders` to the
 * given Response. Used by route handlers to attach the default Cache-Control
 * and CORS values from `config.json`.
 */
export function addResponseHeaders (res: Response): void {
  Object.entries(getConfigOption('ipp.responseHeaders', {}) as { [key: string]: string })
    .forEach(([header, value]) => {
      res.set(header, value)
    })
}

/** Stop browsers and shared caches storing a response: a password-protected share, or an error. */
export function addNoStoreHeaders (res: Response): void {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
}

/**
 * A signal that aborts when the visitor's connection closes before the
 * response has finished, so the request to Immich stops with it.
 */
export function abortOnClose (res: Response): AbortSignal {
  const controller = new AbortController()
  const onClose = () => { if (!res.writableFinished) controller.abort() }
  res.once('close', onClose)
  if (res.closed) onClose()
  return controller.signal
}

/**
 * Wrap an async route handler so a rejected promise is passed to Express's
 * error chain (and on to `errorHandler`).
 */
export function asyncHandler (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next)
  }
}
