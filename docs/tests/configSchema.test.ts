import { describe, it, expect } from 'vitest'
import { checkKeys, parsePage, readConfigSchema, type ConfigKey, type ConfigType } from '../.vitepress/configSchema'

/*
  The first test is the one that matters: the same check `vitepress build`
  runs, against the real pages and config files. The rest pin the contract
  in docs/README.md, "Config reference pages".
*/

describe('the config reference pages', () => {
  it('match app/config.json and upload-app/config.json', () => {
    expect(readConfigSchema().problems).toEqual([])
  })
})

/** A reference page with the given prefix and body. */
function page (prefix: string, body: string): string {
  return `---\nprefix: ${prefix}\n---\n\n# Page\n\n${body}`
}

describe('parsePage', () => {
  it('reads a key section: type, default, description and allowed values', () => {
    const { keys, problems } = parsePage(page('ipp', [
      '## `quality`',
      '',
      '**Type:** `string` · **Default:** `"preview"`',
      '',
      'Highest quality',
      'served.',
      '',
      '- `"preview"` - the preview (default).',
      '- `"original"` - the original',
      '  file.',
      '',
      'More prose.'
    ].join('\n')), '/config/test')
    expect(problems).toEqual([])
    expect(keys).toEqual([{
      path: 'ipp.quality',
      type: 'string',
      default: 'preview',
      description: 'Highest quality served.',
      values: [
        { value: 'preview', description: 'the preview (default).' },
        { value: 'original', description: 'the original file.' }
      ],
      page: '/config/test',
      anchor: 'quality'
    }])
  })

  it('treats a heading without a Type line as prose', () => {
    const { keys } = parsePage(page('ipp', [
      '## Example',
      '',
      'Some text.',
      '',
      '### `PUBLIC_BASE_URL`',
      '',
      '**Optional**',
      '',
      '```md',
      '## `inFence`',
      '',
      '**Type:** `bool` · **Default:** `false`',
      '```'
    ].join('\n')), '/config/test')
    expect(keys).toEqual([])
  })

  it('reads nothing from a page without a prefix', () => {
    const markdown = '# Page\n\n## `key`\n\n**Type:** `bool` · **Default:** `false`\n\nText.\n'
    expect(parsePage(markdown, '/config/test')).toEqual({ keys: [], problems: [] })
  })

  it('treats a list as prose unless every item starts with an inline-code value', () => {
    const { keys } = parsePage(page('ipp', [
      '## `uploadUrl`',
      '',
      '**Type:** `string` · **Default:** `"/upload"`',
      '',
      'Where the service is.',
      '',
      '- **A path** means the same hostname.',
      '- `""` never shows the button.'
    ].join('\n')), '/config/test')
    expect(keys[0].values).toBeUndefined()
  })

  it('reports an allowed value that is not JSON, and an unknown type', () => {
    const { problems } = parsePage(page('ipp', [
      '## `quality`',
      '',
      '**Type:** `string` · **Default:** `"preview"`',
      '',
      'Highest quality.',
      '',
      '- `preview` - unquoted.',
      '',
      '## `count`',
      '',
      '**Type:** `number` · **Default:** `1`',
      '',
      'How many.'
    ].join('\n')), '/config/test')
    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain('an allowed value of `ipp.quality` is not JSON')
    expect(problems[1]).toContain('the Type line of `ipp.count`')
  })

  it('reads one key per row of a flag table', () => {
    const { keys, problems } = parsePage(page('ipp.showMetadata', [
      '## EXIF group',
      '',
      'Under `ipp.showMetadata.exif`. Every flag defaults to `false`.',
      '',
      '| Option | Type   | Default | Description     |',
      '|--------|--------|---------|-----------------|',
      '| `make` | `bool` | `false` | Camera make.    |',
      '| `iso`  | `bool` | `true`  | ISO sensitivity. |'
    ].join('\n')), '/config/metadata')
    expect(problems).toEqual([])
    expect(keys.map(key => [key.path, key.default, key.anchor])).toEqual([
      ['ipp.showMetadata.exif.make', false, 'exif-group'],
      ['ipp.showMetadata.exif.iso', true, 'exif-group']
    ])
  })
})

/** A documented key with the parts `checkKeys` looks at. */
function key (path: string, type: ConfigType, extra: Partial<ConfigKey> = {}): ConfigKey {
  return { path, type, description: 'Text.', page: '/config/test', anchor: 'anchor', ...extra }
}

const APP = 'app/config.json'
const UPLOAD = 'upload-app/config.json'

describe('checkKeys', () => {
  it('passes when every key is documented with its default, both ways', () => {
    const { problems } = checkKeys(
      [key('ipp.showTitle', 'bool', { default: true }), key('ipp.upload.maxFileSize', 'int', { default: 500 })],
      [{ name: APP, config: { ipp: { showTitle: true } } }, { name: UPLOAD, config: { ipp: { upload: { maxFileSize: 500 } } } }]
    )
    expect(problems).toEqual([])
  })

  it('reports a key in a file that no page documents', () => {
    const { problems } = checkKeys([], [{ name: APP, config: { ipp: { showTitle: true } } }])
    expect(problems).toEqual(['`ipp.showTitle` in app/config.json is not documented on any page in docs/config'])
  })

  it('reports a documented key that is in neither file', () => {
    const { problems } = checkKeys([key('ipp.gone', 'bool', { default: false })], [{ name: APP, config: {} }])
    expect(problems).toEqual(['`ipp.gone` is documented in docs/config/test.md but is in neither app/config.json'])
  })

  it('reports a default, type or allowed values that disagree with the file', () => {
    const { problems } = checkKeys([
      key('ipp.cacheTime', 'int', { default: 600 }),
      key('ipp.uploadUrl', 'bool', { default: false }),
      key('ipp.quality', 'string', { default: 'original', values: [{ value: 'preview', description: '' }] })
    ], [{ name: APP, config: { ipp: { cacheTime: 300, uploadUrl: '/upload', quality: 'original' } } }])
    expect(problems).toEqual([
      '`ipp.cacheTime` defaults to 600 in docs/config/test.md but to 300 in app/config.json',
      '`ipp.uploadUrl` is documented as `bool` in docs/config/test.md but is "/upload" in app/config.json',
      'the allowed values of `ipp.quality` in docs/config/test.md do not include its default, "original"'
    ])
  })

  it('reports a key documented twice', () => {
    const twice = key('ipp.allowSlugLinks', 'bool', { default: true })
    const { problems } = checkKeys([twice, twice], [{ name: APP, config: { ipp: { allowSlugLinks: true } } }])
    expect(problems).toEqual(['`ipp.allowSlugLinks` is documented twice, in docs/config/test.md and docs/config/test.md'])
  })

  it('reports a key shared by both files with a different default in each', () => {
    const { problems } = checkKeys(
      [key('ipp.allowSlugLinks', 'bool', { default: true })],
      [{ name: APP, config: { ipp: { allowSlugLinks: true } } }, { name: UPLOAD, config: { ipp: { allowSlugLinks: false } } }]
    )
    expect(problems).toEqual(['`ipp.allowSlugLinks` is true in app/config.json but false in upload-app/config.json'])
  })

  it('takes a free-form object\'s default from the file and leaves its children undocumented', () => {
    const headers = { 'Cache-Control': 'no-store' }
    const { keys, problems } = checkKeys([key('ipp.responseHeaders', 'object')], [{ name: APP, config: { ipp: { responseHeaders: headers } } }])
    expect(problems).toEqual([])
    expect(keys[0].default).toEqual(headers)
  })

  it('treats an object key with keys documented under it as a group, left out of the keys', () => {
    const { keys, problems } = checkKeys(
      [key('ipp.gallery', 'object'), key('ipp.gallery.showTitle', 'bool', { default: true })],
      [{ name: APP, config: { ipp: { gallery: { showTitle: true, singleImage: false } } } }]
    )
    expect(problems).toEqual(['`ipp.gallery.singleImage` in app/config.json is not documented on any page in docs/config'])
    expect(keys.map(field => field.path)).toEqual(['ipp.gallery.showTitle'])
  })

  it('reports a missing default on anything but an object key', () => {
    const { problems } = checkKeys([key('ipp.showTitle', 'bool')], [{ name: APP, config: { ipp: { showTitle: true } } }])
    expect(problems).toEqual(['`ipp.showTitle` has no default in docs/config/test.md'])
  })
})
