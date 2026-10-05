import { NextFunction, Request, Response } from 'express-serve-static-core'
import { getConfigOption } from './config/access'

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
 * Wrap an async route handler so a rejected promise is passed to Express's
 * error chain (and on to `errorHandler`).
 */
export function asyncHandler (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next)
  }
}
