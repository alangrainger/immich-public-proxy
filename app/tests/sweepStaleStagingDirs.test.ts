import { describe, it, expect, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sweepStaleStagingDirs } from '../src/stream/download'

const PREFIX = 'ipp-zip-'

async function makeDir (name: string, mtimeMsAgo: number) {
  const path = join(tmpdir(), name)
  await fs.mkdir(path, { recursive: true })
  await fs.writeFile(join(path, 'inside.bin'), 'x')
  const mtime = new Date(Date.now() - mtimeMsAgo)
  await fs.utimes(path, mtime, mtime)
  return path
}

async function exists (path: string) {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

const created: string[] = []

afterEach(async () => {
  await Promise.all(created.splice(0).map(p => fs.rm(p, { recursive: true, force: true }).catch(() => { /* best effort */ })))
})

describe('sweepStaleStagingDirs', () => {
  it('deletes stale staging dirs older than the cutoff', async () => {
    const stale = await makeDir(PREFIX + 'stale-' + process.pid + '-' + Math.random().toString(36).slice(2), 2 * 60 * 60 * 1000)
    created.push(stale)
    await sweepStaleStagingDirs(60 * 60 * 1000)
    expect(await exists(stale)).toBe(false)
  })

  it('preserves staging dirs younger than the cutoff', async () => {
    const fresh = await makeDir(PREFIX + 'fresh-' + process.pid + '-' + Math.random().toString(36).slice(2), 10 * 60 * 1000)
    created.push(fresh)
    await sweepStaleStagingDirs(60 * 60 * 1000)
    expect(await exists(fresh)).toBe(true)
  })

  it('ignores directories that do not match the staging prefix', async () => {
    const unrelated = await makeDir('not-ipp-zip-' + process.pid + '-' + Math.random().toString(36).slice(2), 24 * 60 * 60 * 1000)
    created.push(unrelated)
    await sweepStaleStagingDirs(60 * 60 * 1000)
    expect(await exists(unrelated)).toBe(true)
  })

  it('uses its default 1h cutoff when called with no argument', async () => {
    const stale = await makeDir(PREFIX + 'default-' + process.pid + '-' + Math.random().toString(36).slice(2), 2 * 60 * 60 * 1000)
    const fresh = await makeDir(PREFIX + 'default2-' + process.pid + '-' + Math.random().toString(36).slice(2), 30 * 60 * 1000)
    created.push(stale, fresh)
    await sweepStaleStagingDirs()
    expect(await exists(stale)).toBe(false)
    expect(await exists(fresh)).toBe(true)
  })
})
