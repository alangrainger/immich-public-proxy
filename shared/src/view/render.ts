import { renderToString } from 'preact-render-to-string'
import { VNode } from 'preact'

/**
 * Render a JSX component to a complete HTML response string.
 * Prepends the doctype so the result is a valid HTML5 document.
 */
export function renderPage (component: VNode): string {
  return '<!DOCTYPE html>' + renderToString(component)
}
