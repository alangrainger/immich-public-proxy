import { sanitize } from '@ipp/core'

const MAX_FILENAME_LENGTH = 254

/*
  Zero-width and bidirectional format characters: invisible in Immich and in a
  notification, or able to make `holiday\u202Egpj.mp4` read as `holiday4pm.jpg`.
  `sanitize` strips C0/C1 controls only.
*/
const formatCharsRe = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

const MAX_UPLOADER_LENGTH = 32

/*
  A stored name is `<prefix><header><original>`. The header is the visitor
  fields, each a slug, each followed by a comma: `ipp_upload_jane-smith,IMG_0042.jpg`.
  Fields are positional, so a field added later goes on the end and an empty
  one is written empty: `ipp_upload_,34,IMG_0042.jpg`. When every field is
  empty there is no header at all, and the name is as it was before fields
  existed. The visitor's own filename never keeps a comma, so a stem with no
  comma has no fields and otherwise the last comma ends the header.
*/
const FIELD_SEPARATOR = ','

/**
 * The visitor's name as a filename slug: lower case, letters and digits in any
 * script, runs of anything else become one hyphen. Empty when nothing usable
 * is left. A slug never contains the field separator.
 */
export function uploaderSlug (raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.normalize('NFC')
    .replace(formatCharsRe, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_UPLOADER_LENGTH)
    .replace(/-+$/, '')
}

/** The header for these fields, in order, or empty when none has a value. */
function fieldHeader (fields: string[]): string {
  if (!fields.some(Boolean)) return ''
  return fields.map(field => field + FIELD_SEPARATOR).join('')
}

/**
 * Turn the visitor-supplied filename into the name Immich will store, with
 * `prefix` applied once and the uploader's slug after it, as
 * `ipp_upload_jane-smith,IMG_0042.jpg`. Returns undefined when nothing usable
 * is left, or when there is no extension: Immich types an asset by its
 * extension and would refuse it.
 */
export function uploadFilename (raw: unknown, prefix: string, uploader = ''): string | undefined {
  if (typeof raw !== 'string') return undefined
  const base = (raw.normalize('NFC').replace(formatCharsRe, '').split(/[\\/]/).pop() || '')
  // Split the extension off first: `sanitize` truncates at 254 characters,
  // which on a very long name would cut the extension away.
  const parts = base.match(/^(.*)(\.[A-Za-z0-9]{1,16})$/)
  if (!parts) return undefined
  const extension = parts[2]
  // The separator is removed from the visitor's name so it only ever marks a field
  const stem = sanitize(parts[1]).split(FIELD_SEPARATOR).join('').trim()
  // An empty stem is a dotfile; a leading dot is a traversal remnant.
  if (!stem || stem.startsWith('.')) return undefined

  const cleanPrefix = sanitize(prefix).trim()
  // Don't stack the prefix, or the name, on a file that already carries the prefix
  const hasPrefix = cleanPrefix !== '' && stem.startsWith(cleanPrefix)
  const wanted = hasPrefix ? '' : cleanPrefix + fieldHeader([uploader])
  const room = MAX_FILENAME_LENGTH - wanted.length - extension.length
  return wanted + stem.slice(0, Math.max(1, room)) + extension
}
