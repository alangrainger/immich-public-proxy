import { describe, it, expect, afterEach } from 'vitest'
import { loadConfig } from '../src/config/loader'
import { getNumericConfigOption } from '../src/config/access'
import { createLimiter } from '../src/utils/limiter'

/*
  Regression tests for the non-numeric concurrency bug: a non-numeric
  `ipp.downloadFromImmichConcurrencyLimit` used to reach createLimiter as NaN,
  where `active >= NaN` is always false - so the limiter never throttled and
  every asset in a zip download hit Immich at once.
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

describe('createLimiter with guarded config', () => {
  /** Run `total` tasks through the limiter and report the concurrency peak */
  async function peakConcurrency (limit: number, total: number): Promise<number> {
    const run = createLimiter(limit)
    let active = 0
    let peak = 0
    await Promise.all(Array.from({ length: total }, () => run(async () => {
      active++
      peak = Math.max(peak, active)
      // Yield so other queued tasks get a chance to start while this one is "active"
      await new Promise(resolve => setTimeout(resolve, 1))
      active--
    })))
    return peak
  }

  it('a NaN limit disables throttling (the failure mode being guarded against)', async () => {
    expect(await peakConcurrency(NaN, 10)).toBe(10)
  })

  it('the guarded value throttles as configured', async () => {
    loadConfigFrom({ ipp: { downloadFromImmichConcurrencyLimit: 'lots' } })
    const limit = Math.max(1, getNumericConfigOption('ipp.downloadFromImmichConcurrencyLimit', 3))
    expect(await peakConcurrency(limit, 10)).toBe(3)
  })
})
