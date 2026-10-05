/**
 * Adapted from https://www.npmjs.com/package/sanitize-filename
 *
 * Replaces characters in strings that are illegal/unsafe for filenames.
 * Unsafe characters are either removed or replaced by a substitute set
 * in the optional second argument.
 *
 * Illegal Characters on Various Operating Systems
 *   / ? < > \ : * | "
 *   https://kb.acronis.com/content/39790
 *
 * Unicode Control codes
 *   C0 0x00-0x1f & C1 (0x80-0x9f)
 *   http://en.wikipedia.org/wiki/C0_and_C1_control_codes
 *
 * Reserved filenames on Unix-based systems (".", "..").
 * Reserved filenames in Windows ("CON", "PRN", "AUX", "NUL", "COM1"-"COM9",
 * "LPT1"-"LPT9") case-insensitively and with or without filename extensions.
 *
 * Capped at 254 characters in length.
 */

const illegalRe = /[/?<>\\:*|"]/g
// eslint-disable-next-line no-control-regex
const controlRe = /[\x00-\x1f\x80-\x9f]/g
const reservedRe = /^\.+$/
const windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i
const windowsTrailingRe = /[. ]+$/

export function sanitize (input: string, replacement = ''): string {
  if (typeof input !== 'string') {
    throw new Error('Input must be string')
  }
  return input
    .replace(illegalRe, replacement)
    .replace(controlRe, replacement)
    .replace(reservedRe, replacement)
    .replace(windowsReservedRe, replacement)
    .replace(windowsTrailingRe, replacement)
    .slice(0, 254)
}
