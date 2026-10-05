import { describe, it, expect } from 'vitest'
import { escapeHtml, jsonForInlineScript } from '../src/utils/text'

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

describe('jsonForInlineScript', () => {
  it('escapes < so </script> cannot terminate an inline script block', () => {
    const out = jsonForInlineScript({ name: '</script><script>alert(1)</script>' })
    expect(out).not.toContain('<')
    expect(out).toContain('\\u003c/script>')
  })

  it('round-trips through JSON.parse unchanged', () => {
    const value = {
      name: '</script> & <!-- tricky --> \u2028\u2029',
      n: 3,
      nested: { arr: [1, 'two'] }
    }
    expect(JSON.parse(jsonForInlineScript(value))).toEqual(value)
  })

  it('escapes the JS line separators U+2028 and U+2029', () => {
    const out = jsonForInlineScript({ s: '\u2028\u2029' })
    expect(out).toBe('{"s":"\\u2028\\u2029"}')
  })

  it('matches JSON.stringify for benign values', () => {
    const value = { a: 1, b: 'plain text', c: null }
    expect(jsonForInlineScript(value)).toBe(JSON.stringify(value))
  })
})
