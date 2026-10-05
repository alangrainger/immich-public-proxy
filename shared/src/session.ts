import crypto from 'crypto'
import cookieSession from 'cookie-session'
import dayjs from 'dayjs'
import { NextFunction, Request, Response } from 'express-serve-static-core'
import { decrypt, encrypt } from './encrypt'
import { log } from './utils/log'
import { toString } from './utils/text'

// Extend the Request type with a `password` property
declare module 'express-serve-static-core' {
  interface Request {
    password?: string;
  }
}

/** Cookie name and path for one app's session. */
export interface SessionOptions {
  /**
   * Each app on a host needs its own name: the secret is random per process,
   * so a shared name makes each app's failed signature check expire the
   * other's cookie, which locks every share the visitor unlocked there.
   */
  name: string
  /** Defaults to `/`. Left unset, browsers would scope the cookie to the request's directory. */
  path?: string
}

/**
 * Cookie-session middleware holding the encrypted share passwords. The
 * signing secret is random per process, so a restart signs every visitor out.
 */
export function sessionMiddleware ({ name, path = '/' }: SessionOptions) {
  return cookieSession({
    name,
    path,
    httpOnly: true,
    sameSite: 'lax',
    secret: crypto.randomBytes(32).toString('base64url')
  })
}

/**
 * Middleware to decode the encrypted data stored in the session cookie
 */
export function decodeCookie (req: Request, _res: Response, next: NextFunction) {
  const shareKey = req.params.key
  const session = req.session?.[shareKey]
  if (shareKey && session?.iv && session?.cr) {
    try {
      const payload = JSON.parse(decrypt({
        iv: toString(session.iv),
        cr: toString(session.cr)
      }))
      if (payload?.expires && dayjs(payload.expires) > dayjs()) {
        req.password = payload.password
      }
    } catch (e) { }
  }
  next()
}

/**
 * Store a share password in the session cookie as an encrypted payload which
 * expires in 1 hour. After that time, the visitor will need to provide the
 * password again.
 *
 * The data is encrypted/decrypted on the server as a db-less way of
 * managing user session data. The data is provided to the server by the
 * user's browser in its encrypted state.
 */
export function storeUnlock (req: Request, key: string, password: string) {
  if (!req.session) return
  req.session[key] = encrypt(JSON.stringify({
    password,
    expires: dayjs().add(1, 'hour').format()
  }))
}

/**
 * Receive an unlock request from the password page (`POST <basePath>/share/unlock`).
 */
export function unlockHandler (req: Request, res: Response) {
  if (req.body.key) storeUnlock(req, req.body.key, req.body.password)
  res.send()
}

/**
 * The visitor sent a password and Immich rejected it. Answer 401 and delete
 * the session entry, so the page doesn't keep saying "Invalid password". The
 * caller still renders the password page.
 */
export function invalidPasswordResponse (req: Request, res: Response, key: string) {
  log('Invalid password for key ' + key)
  res.status(401)
  if (req.session) delete req.session[key]
}
