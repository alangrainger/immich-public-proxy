import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readUploadFilename, uploadFilename } from '../src/filename'
import { main, tagUploads, TagOptions } from '../src/tag-uploads'
import { resetConfig, setConfig } from './helpers'

describe('readUploadFilename', () => {
  const read = (name: string, separator = ',') => readUploadFilename(name, 'ipp_upload_', separator)

  it('reads the name that uploadFilename wrote', () => {
    for (const [file, uploader] of [['IMG_0042.jpg', 'jane-smith'], ['Paris France.jpg', 'zoë-müller'], ['a.png', '山田-太郎']]) {
      const stored = uploadFilename(file, 'ipp_upload_', uploader) || ''
      expect(read(stored)).toEqual({ kind: 'named', uploader })
    }
  })

  it('reads a configured separator', () => {
    expect(read('ipp_upload_jane-smith^Paris, France.jpg', '^')).toEqual({ kind: 'named', uploader: 'jane-smith' })
  })

  it('takes the first field as the uploader when later fields exist', () => {
    expect(read('ipp_upload_jane-smith,34,IMG_0042.jpg')).toEqual({ kind: 'named', uploader: 'jane-smith' })
  })

  it('is anonymous with no fields or an empty name field', () => {
    expect(read('ipp_upload_IMG_0042.jpg')).toEqual({ kind: 'anonymous' })
    expect(read('ipp_upload_,34,IMG_0042.jpg')).toEqual({ kind: 'anonymous' })
  })

  it('refuses names that 4.0.0 stored with a comma in the visitor filename', () => {
    expect(read('ipp_upload_Venice, Italy.jpg')?.kind).toBe('unreadable')
    expect(read('ipp_upload_venice, italy.jpg')?.kind).toBe('unreadable')
    expect(read('ipp_upload_Smith,John.jpg')?.kind).toBe('unreadable')
  })

  it('is undefined without the prefix, or with an empty prefix', () => {
    expect(read('IMG_0042.jpg')).toBeUndefined()
    expect(read('IPP_UPLOAD_jane-smith,IMG_0042.jpg')).toBeUndefined()
    expect(readUploadFilename('jane-smith,IMG_0042.jpg', '', ',')).toBeUndefined()
  })
})

const ME = 'aaaaaaaa-0000-4000-8000-000000000001'
const PARTNER = 'aaaaaaaa-0000-4000-8000-000000000002'

/** A fake Immich: one owner, a few uploads over two search pages, and tag state that persists between runs. */
function fakeImmich (extraAssets: Array<Record<string, unknown>> = []) {
  let next = 0
  const asset = (originalFileName: string, extra: Record<string, unknown> = {}) => ({
    id: 'asset-' + (++next), ownerId: ME, originalFileName, visibility: 'timeline', isTrashed: false, ...extra
  })
  const page1 = [
    asset('ipp_upload_jane-smith,IMG_0042.jpg'),
    asset('ipp_upload_jane-smith,IMG_0043.jpg', { visibility: 'archive' }),
    asset('ipp_upload_IMG_0044.jpg'),
    asset('ipp_upload_Venice, Italy.jpg'),
    asset('ipp_upload_bob,clip.mp4', { ownerId: PARTNER }),
    asset('ipp_upload_bob,trashed.jpg', { isTrashed: true }),
    asset('ipp_upload_bob,IMG_0045.mp4', { visibility: 'hidden' }),
    asset('my_ipp_upload_bob,IMG_0046.jpg'),
    asset('IPP_UPLOAD_bob,IMG_0047.jpg')
  ]
  const page2 = [asset('ipp_upload_zoë-müller,beach.png'), ...extraAssets.map(a => asset(String(a.originalFileName), a))]
  const tags = new Map<string, string>()
  const tagged = new Set<string>()
  const calls: Array<{ method: string, path: string, body: { assetIds: string[] } }> = []

  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace('http://immich.test/api', '')
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method: init.method || 'GET', path, body })
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
    if ((init.headers as Record<string, string>)['x-api-key'] !== 'good-key') return json({ message: 'Invalid API key' }, 401)
    if (path === '/users/me') return json({ id: ME })
    if (path === '/search/metadata') {
      return json({ assets: body.page === 1 ? { items: page1, nextPage: '2' } : { items: page2, nextPage: null } })
    }
    if (path === '/tags') {
      return json(body.tags.map((value: string) => {
        if (!tags.has(value)) tags.set(value, 'tag-' + (tags.size + 1))
        return { id: tags.get(value), value }
      }))
    }
    if (path === '/tags/assets') {
      let count = 0
      for (const tagId of body.tagIds) {
        for (const assetId of body.assetIds) {
          if (!tagged.has(tagId + ':' + assetId)) count++
          tagged.add(tagId + ':' + assetId)
        }
      }
      return json({ count })
    }
    return json({ message: 'Not found' }, 404)
  })
  return { fetch, calls, tags, tagged }
}

describe('tagUploads', () => {
  let lines: string[]
  const options = (overrides: Partial<TagOptions> = {}): TagOptions => ({
    apiKey: 'good-key', apply: false, parent: 'Uploaded', prefix: 'ipp_upload_', separator: ',', print: line => lines.push(line), ...overrides
  })

  beforeEach(() => {
    lines = []
    process.env.IMMICH_URL = 'http://immich.test'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.IMMICH_URL
  })

  it('reports in a dry run and writes nothing', async () => {
    const immich = fakeImmich()
    vi.stubGlobal('fetch', immich.fetch)
    const summary = await tagUploads(options())
    expect([...summary.named.keys()].sort()).toEqual(['jane-smith', 'zoë-müller'])
    expect(summary.named.get('jane-smith')).toHaveLength(2)
    expect(summary.anonymous).toBe(1)
    expect(summary.unreadable).toBe(1)
    expect(summary.tagged).toBe(0)
    expect(immich.calls.filter(call => call.method === 'PUT')).toEqual([])
    expect(lines).toContain('  ipp_upload_jane-smith,IMG_0042.jpg')
    expect(lines.some(line => line.startsWith('Skipped ipp_upload_Venice, Italy.jpg'))).toBe(true)
    expect(lines.at(-1)).toMatch(/^Dry run/)
  })

  it('keeps only the owner\'s untrashed, visible files that start with the exact prefix', async () => {
    const immich = fakeImmich()
    vi.stubGlobal('fetch', immich.fetch)
    const summary = await tagUploads(options())
    expect(summary.named.has('bob')).toBe(false)
    expect(lines[0]).toBe('Found 5 files starting with "ipp_upload_".')
  })

  it('tags with --apply, and a second run tags nothing new', async () => {
    const immich = fakeImmich()
    vi.stubGlobal('fetch', immich.fetch)
    const first = await tagUploads(options({ apply: true }))
    expect(first.tagged).toBe(3)
    expect([...immich.tags.keys()].sort()).toEqual(['Uploaded/jane-smith', 'Uploaded/zoë-müller'])
    expect(lines).toContain('Uploaded/jane-smith: 2 files, 2 newly tagged')

    lines = []
    const second = await tagUploads(options({ apply: true }))
    expect(second.tagged).toBe(0)
    expect(lines).toContain('Uploaded/jane-smith: 2 files, 0 newly tagged')
  })

  it('sends large sets in batches', async () => {
    const many = Array.from({ length: 1201 }, (_, i) => ({ originalFileName: `ipp_upload_crowd,IMG_${i}.jpg` }))
    const immich = fakeImmich(many)
    vi.stubGlobal('fetch', immich.fetch)
    const summary = await tagUploads(options({ apply: true }))
    const batches = immich.calls.filter(call => call.path === '/tags/assets').map(call => call.body.assetIds.length)
    expect(batches).toEqual([500, 500, 201, 2, 1])
    expect(summary.tagged).toBe(1204)
  })

  it('uses the given parent and separator', async () => {
    const immich = fakeImmich([{ originalFileName: 'ipp_upload_ann^Rome, Italy.jpg' }])
    vi.stubGlobal('fetch', immich.fetch)
    await tagUploads(options({ apply: true, parent: 'Guests/2026', separator: '^' }))
    expect([...immich.tags.keys()]).toEqual(['Guests/2026/ann'])
  })

  it('stops with a useful message when Immich refuses the key', async () => {
    vi.stubGlobal('fetch', fakeImmich().fetch)
    await expect(tagUploads(options({ apiKey: 'bad-key' }))).rejects.toThrow(/status 401: Invalid API key\. Check IMMICH_API_KEY\./)
  })
})

describe('main', () => {
  let errors: string[]
  beforeEach(() => {
    errors = []
    vi.spyOn(console, 'error').mockImplementation((line: string) => { errors.push(line) })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    process.env.IMMICH_URL = 'http://immich.test'
    process.env.IMMICH_API_KEY = 'good-key'
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resetConfig()
    delete process.env.IMMICH_URL
    delete process.env.IMMICH_API_KEY
  })

  it('needs an API key', async () => {
    delete process.env.IMMICH_API_KEY
    expect(await main([])).toBe(2)
    expect(errors[0]).toMatch(/^IMMICH_API_KEY is not set/)
  })

  it('refuses an empty prefix, which would match the owner\'s own photos', async () => {
    setConfig({ ipp: { upload: { filenamePrefix: '' } } })
    expect(await main([])).toBe(2)
    expect(errors[0]).toMatch(/prefix is empty/)
  })

  it('refuses an unknown flag or an unusable separator', async () => {
    expect(await main(['--aply'])).toBe(2)
    expect(await main(['--separator', '-'])).toBe(2)
  })

  it('reads the separator from config, and exits 1 on an Immich error', async () => {
    setConfig({ ipp: { upload: { fieldSeparator: '^' } } })
    const immich = fakeImmich([{ originalFileName: 'ipp_upload_ann^Rome, Italy.jpg' }])
    vi.stubGlobal('fetch', immich.fetch)
    expect(await main(['--apply'])).toBe(0)
    expect([...immich.tags.keys()]).toEqual(['Uploaded/ann'])
    process.env.IMMICH_API_KEY = 'bad-key'
    expect(await main([])).toBe(1)
  })
})
