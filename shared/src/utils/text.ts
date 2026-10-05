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
 * Serialise a value as JSON that is safe to embed inside an inline `<script>`
 * block. `JSON.stringify` does not escape `<`, so a string value containing
 * `</script>` would terminate the script element early and inject markup into
 * the page.
 */
export function jsonForInlineScript (value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * Narrow an `unknown` to `string`, returning an empty string for any other
 * type. Used at boundaries where the input shape isn't statically known
 * (cookie session payloads, etc.).
 */
export function toString (value: unknown): string {
  return typeof value === 'string' ? value : ''
}
