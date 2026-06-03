import { describe, it, expect } from 'vitest'
import { escapeHtml } from '../src/utils/text'

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    )
  })

  it('escapes ampersand first so other escapes are not re-escaped', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;')
  })

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#039;s')
  })

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('')
  })

  it('passes through strings with no special characters', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123')
  })
})
