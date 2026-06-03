/**
 * Escape the five HTML-significant characters so that user-controlled text
 * can be embedded in HTML without injecting markup. Ampersand is escaped
 * first so the other replacements aren't double-escaped.
 */
export function escapeHtml (str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Narrow an `unknown` to `string`, returning an empty string for any other
 * type. Used at boundaries where the input shape isn't statically known
 * (cookie session payloads, etc.).
 */
export function toString (value: unknown): string {
  return typeof value === 'string' ? value : ''
}
