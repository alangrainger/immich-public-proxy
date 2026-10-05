import { describe, it, expect, afterEach } from 'vitest'
import { loadConfig } from '../src/config/loader'
import { getNumericConfigOption } from '../src/config/access'

/*
  Regression tests for the non-numeric config bug: a non-numeric
  `ipp.downloadFromImmichConcurrencyLimit` used to reach its consumer as NaN,
  where `active >= NaN` is always false - so the download concurrency limit
  never throttled and every asset in a zip download hit Immich at once.
*/

function loadConfigFrom (config: Record<string, unknown>) {
  process.env.CONFIG = JSON.stringify(config)
  loadConfig()
}

afterEach(() => {
  delete process.env.CONFIG
  loadConfig()
})

describe('getNumericConfigOption', () => {
  it('returns a configured number', () => {
    loadConfigFrom({ ipp: { downloadFromImmichConcurrencyLimit: 5 } })
    expect(getNumericConfigOption('ipp.downloadFromImmichConcurrencyLimit', 20)).toBe(5)
  })

  it('coerces a numeric string (docker-compose env values arrive as strings)', () => {
    loadConfigFrom({ ipp: { downloadFromImmichConcurrencyLimit: '5' } })
    expect(getNumericConfigOption('ipp.downloadFromImmichConcurrencyLimit', 20)).toBe(5)
  })

  it('falls back to the default for a non-numeric value instead of NaN', () => {
    loadConfigFrom({ ipp: { downloadFromImmichConcurrencyLimit: 'lots' } })
    expect(getNumericConfigOption('ipp.downloadFromImmichConcurrencyLimit', 20)).toBe(20)
  })

  it('falls back to the default for non-scalar values', () => {
    loadConfigFrom({ ipp: { downloadFromImmichConcurrencyLimit: { max: 5 } } })
    expect(getNumericConfigOption('ipp.downloadFromImmichConcurrencyLimit', 20)).toBe(20)
  })

  it('falls back to the default when the option is unset', () => {
    loadConfigFrom({})
    expect(getNumericConfigOption('ipp.downloadFromImmichConcurrencyLimit', 20)).toBe(20)
  })
})
