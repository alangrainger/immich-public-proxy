import { sanitize } from '@ipp/core'

const MAX_FILENAME_LENGTH = 254

/*
  Zero-width and bidirectional format characters: invisible in Immich and in a
  notification, or able to make `holiday\u202Egpj.mp4` read as `holiday4pm.jpg`.
  `sanitize` strips C0/C1 controls only.
*/
const formatCharsRe = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

/**
 * Turn the visitor-supplied filename into the name Immich will store, with
 * `prefix` applied once. Returns undefined when nothing usable is left, or
 * when there is no extension: Immich types an asset by its extension and
 * would refuse it.
 */
export function uploadFilename (raw: unknown, prefix: string): string | undefined {
  if (typeof raw !== 'string') return undefined
  const base = (raw.normalize('NFC').replace(formatCharsRe, '').split(/[\\/]/).pop() || '')
  // Split the extension off first: `sanitize` truncates at 254 characters,
  // which on a very long name would cut the extension away.
  const parts = base.match(/^(.*)(\.[A-Za-z0-9]{1,16})$/)
  if (!parts) return undefined
  const extension = parts[2]
  const stem = sanitize(parts[1]).trim()
  // An empty stem is a dotfile; a leading dot is a traversal remnant.
  if (!stem || stem.startsWith('.')) return undefined

  const cleanPrefix = sanitize(prefix).trim()
  // Don't stack the prefix on a file that already carries it
  const wanted = stem.startsWith(cleanPrefix) ? '' : cleanPrefix
  const room = MAX_FILENAME_LENGTH - wanted.length - extension.length
  return wanted + stem.slice(0, Math.max(1, room)) + extension
}
