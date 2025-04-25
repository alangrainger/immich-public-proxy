/*
This function is in its own file so that *if desired* someone can replace the entire
function with their own custom one, by replacing the invalidRequestHandler.js file
through a Docker volume mount.
 */

import { Response } from 'express-serve-static-core'
import { getConfigOption } from './functions'

export function respondToInvalidRequest (res: Response, defaultResponse: number | string | null) {
  let method = getConfigOption('ipp.customInvalidResponse', false)
  if (method === false) {
    // No custom method specified, use the default
    method = defaultResponse
  }

  if (typeof method === 'number') {
    // Respond with an HTTP status code
    res.status(method).send()
  } else if (method === null) {
    // Drop the connection without responding
    res.destroy()
  } else if (typeof method === 'string' && method.startsWith('http')) {
    // Redirect to another URL
    res.redirect(method)
  } else {
    // Fallback to 404
    res.status(404).send()
  }
}
