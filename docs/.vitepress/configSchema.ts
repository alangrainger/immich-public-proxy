/*
  Parses the config reference pages (docs/config/*.md) into a schema and
  checks it against the default config files, both ways. The page format
  this parser accepts is the contract in docs/README.md, "Config reference
  pages"; change the two together.

  No Node APIs here: the config generator runs these checks in the browser
  too. Reading the files from disk is in configCheck.ts.
*/

/** Whether a config value is a plain JSON object (not an array or null). */
export function isObject (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Deep equality of two JSON values; the order of object keys doesn't matter. */
export function sameValue (a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => sameValue(item, b[i]))
  if (!isObject(a) || !isObject(b)) return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
}

/** The types a `**Type:**` line can name, each with the check its default must pass. */
const TYPE_CHECKS = {
  bool: (value: unknown) => typeof value === 'boolean',
  int: (value: unknown) => Number.isInteger(value),
  string: (value: unknown) => typeof value === 'string',
  object: isObject,
  'bool or string': (value: unknown) => typeof value === 'boolean' || typeof value === 'string',
  various: () => true
}

export type ConfigType = keyof typeof TYPE_CHECKS

/** Whether a value is of a documented type, e.g. `matchesType('int', 2)`. */
export function matchesType (type: ConfigType, value: unknown): boolean {
  return TYPE_CHECKS[type](value)
}

/** Words a label writes in capitals. Add an acronym here when a new key name contains one. */
const ACRONYMS = new Set(['exif', 'gps', 'iso', 'url'])

/**
 * Labels for the keys whose name, split into words, doesn't read well or
 * leaves out a unit. The check fails on a path that no page documents, so a
 * renamed key can't leave its label behind.
 */
export const LABELS: Record<string, string> = {
  'ipp.gallery.singleImage': 'Gallery page for a single image',
  'ipp.gallery.singleVideo': 'Gallery page for a single video',
  'ipp.gallery.singleItemAutoOpen': 'Open single items in the lightbox',
  'ipp.gallery.cacheTime': 'Cache time (seconds)',
  'ipp.lightbox.autoPlayVideos': 'Autoplay videos',
  'ipp.showMetadata.exif.dateTimeOriginal': 'Date taken',
  'ipp.showMetadata.exif.fNumber': 'Aperture',
  'ipp.showMetadata.location.webLink': 'Map link',
  'ipp.upload.maxFileSize': 'Max file size (MB)',
  'ipp.upload.rateLimit': 'Rate limit (files per minute)',
  'ipp.upload.byteBudget': 'Byte budget (MB per hour)',
  'ipp.upload.notifyTimeout': 'Notify timeout (ms)'
}

/**
 * A key's label for the config generator: its entry in `LABELS`, or else the
 * last part of its path as words, so `showArrows` is "Show arrows" and
 * `notifyUrl` is "Notify URL".
 */
export function keyLabel (path: string): string {
  if (Object.hasOwn(LABELS, path)) return LABELS[path]
  const name = path.slice(path.lastIndexOf('.') + 1)
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(' ')
  const text = words.map(word => ACRONYMS.has(word) ? word.toUpperCase() : word).join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** One allowed value of a key, from its enum list. */
export interface ConfigValue {
  value: unknown
  /** The item's text after the value, as markdown. */
  description: string
}

/** One documented config key. */
export interface ConfigKey {
  /** The full dotted path, e.g. `ipp.gallery.showTitle`. */
  path: string
  type: ConfigType
  /** Absent only for an object key whose page gives none (a group or a free-form object). */
  default?: unknown
  /** The allowed values, when the section has an enum list. */
  values?: ConfigValue[]
  /** The section's first paragraph, or the table row's description, as markdown. */
  description: string
  /** The site path of the page, e.g. `/config/gallery`. */
  page: string
  /** The anchor of the key's section on that page. */
  anchor: string
  /** For a row of a flag table, the heading of the table's section. */
  group?: string
}

/** A default config file, named by its repo path for messages. */
export interface DefaultsFile {
  name: string
  config: Record<string, unknown>
}

/** The markdown structures the contract is made of. Everything else is `other`. */
type Block =
  | { kind: 'heading', level: number, text: string }
  | { kind: 'paragraph', text: string }
  | { kind: 'list', items: string[] }
  | { kind: 'table', rows: string[][] }
  | { kind: 'other' }

/**
 * Split a page body into blocks. Blocks are separated by blank lines;
 * code fences and callouts become `other`, so a `##` or a list inside
 * them is never mistaken for part of the contract.
 */
function toBlocks (markdown: string): Block[] {
  const lines = markdown.split('\n')
  const blocks: Block[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    if (line.trimStart().startsWith('```')) {
      while (++i < lines.length && !lines[i].trimStart().startsWith('```'));
      blocks.push({ kind: 'other' })
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() })
      continue
    }
    const group = [line]
    while (i + 1 < lines.length && lines[i + 1].trim() !== '' && !/^(#{1,6}\s|\s*```)/.test(lines[i + 1])) {
      group.push(lines[++i])
    }
    const previous = blocks[blocks.length - 1]
    if (line.startsWith('|')) {
      const rows = group.filter(row => !/^\|[\s:|-]+\|$/.test(row.trim()))
      blocks.push({ kind: 'table', rows: rows.map(row => row.trim().slice(1, -1).split('|').map(cell => cell.trim())) })
    } else if (line.startsWith('- ')) {
      const items: string[] = []
      for (const itemLine of group) {
        if (itemLine.startsWith('- ')) items.push(itemLine.slice(2).trim())
        else items[items.length - 1] += ' ' + itemLine.trim()
      }
      // A blank line between items doesn't end a markdown list
      if (previous?.kind === 'list') previous.items.push(...items)
      else blocks.push({ kind: 'list', items })
    } else if (line.startsWith('>')) {
      blocks.push({ kind: 'other' })
    } else {
      blocks.push({ kind: 'paragraph', text: group.map(text => text.trim()).join(' ') })
    }
  }
  return blocks
}

/** The anchor VitePress gives a heading, under the docs/README.md rule for link-target headings. */
function toAnchor (heading: string): string {
  return heading.replace(/`/g, '').trim().toLowerCase().replace(/\s+/g, '-')
}

/** JSON.parse without the throw, for values written on a page. */
function parseLiteral (text: string): { ok: true, value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

/** Whether a type name, backticks removed, is one the contract knows. */
function isConfigType (type: string): type is ConfigType {
  return Object.hasOwn(TYPE_CHECKS, type)
}

/**
 * Parse one reference page into the keys it documents. A page without a
 * `prefix` in its frontmatter documents none. `page` is its site path, used
 * in the keys and in problems.
 */
export function parsePage (markdown: string, page: string): { keys: ConfigKey[], problems: string[] } {
  const keys: ConfigKey[] = []
  const problems: string[] = []
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(markdown)
  const prefix = /^prefix:\s*(\S+)\s*$/m.exec(frontmatter?.[1] ?? '')?.[1]
  if (!frontmatter || !prefix) return { keys, problems }
  const where = 'docs' + page + '.md'

  const blocks = toBlocks(markdown.slice(frontmatter[0].length))
  for (let i = 0; i < blocks.length; i++) {
    const heading = blocks[i]
    if (heading.kind !== 'heading' || heading.level < 2 || heading.level > 3) continue
    let end = i + 1
    while (end < blocks.length && blocks[end].kind !== 'heading') end++
    const section = blocks.slice(i + 1, end)
    const anchor = toAnchor(heading.text)
    const first = section[0]
    if (first?.kind !== 'paragraph') continue

    const key = /^`([^`]+)`$/.exec(heading.text)?.[1]
    if (key && first.text.startsWith('**Type:**')) {
      const path = prefix + '.' + key
      const typeLine = /^\*\*Type:\*\* (.+?)(?: · \*\*Default:\*\* `(.*)`)?$/.exec(first.text)
      const type = typeLine?.[1].replace(/`/g, '')
      if (!typeLine || !type || !isConfigType(type)) {
        problems.push(`${where}: the Type line of \`${path}\` has an unknown type or does not match the contract: ${first.text}`)
        continue
      }
      const entry: ConfigKey = { path, type, description: '', page, anchor }
      if (typeLine[2] !== undefined) {
        const parsed = parseLiteral(typeLine[2])
        if (parsed.ok) entry.default = parsed.value
        else problems.push(`${where}: the default of \`${path}\` is not JSON: ${typeLine[2]}`)
      }
      const description = section[1]
      if (description?.kind === 'paragraph') entry.description = description.text
      else problems.push(`${where}: \`${path}\` has no description paragraph after its Type line`)
      const list = section[2]
      if (description?.kind === 'paragraph' && list?.kind === 'list' && list.items.every(item => item.startsWith('`'))) {
        entry.values = []
        for (const item of list.items) {
          const [, literal, text] = /^`([^`]*)`\s*(?:-\s*)?(.*)$/.exec(item) ?? []
          const parsed = parseLiteral(literal ?? '')
          if (parsed.ok) entry.values.push({ value: parsed.value, description: text ?? '' })
          else problems.push(`${where}: an allowed value of \`${path}\` is not JSON: ${item}`)
        }
      }
      keys.push(entry)
      continue
    }

    const under = /^Under `([^`]+)`\./.exec(first.text)?.[1]
    const table = section.find(block => block.kind === 'table')
    if (under && table?.kind === 'table') {
      if (under !== prefix && !under.startsWith(prefix + '.')) {
        problems.push(`${where}: \`${under}\` in "${heading.text}" is not under the page prefix \`${prefix}\``)
        continue
      }
      const [header, ...rows] = table.rows
      const column = (name: string) => header.indexOf(name)
      const columns = { option: column('Option'), type: column('Type'), default: column('Default'), description: column('Description') }
      if (Object.values(columns).includes(-1)) {
        problems.push(`${where}: the table in "${heading.text}" needs Option, Type, Default and Description columns`)
        continue
      }
      for (const row of rows) {
        const path = under + '.' + row[columns.option].replace(/`/g, '')
        const type = row[columns.type].replace(/`/g, '')
        const parsed = parseLiteral(row[columns.default].replace(/`/g, ''))
        if (!isConfigType(type)) problems.push(`${where}: \`${path}\` has an unknown type: ${row[columns.type]}`)
        else if (!parsed.ok) problems.push(`${where}: the default of \`${path}\` is not JSON: ${row[columns.default]}`)
        else keys.push({ path, type, default: parsed.value, description: row[columns.description], page, anchor, group: heading.text })
      }
    }
  }
  return { keys, problems }
}

/**
 * Every node of a config file by dotted path, objects included, so that
 * both a leaf and a group can be looked up.
 */
function flatten (config: Record<string, unknown>, prefix = ''): Map<string, unknown> {
  const nodes = new Map<string, unknown>()
  for (const [name, value] of Object.entries(config)) {
    const path = prefix + name
    nodes.set(path, value)
    if (isObject(value)) for (const [child, childValue] of flatten(value, path + '.')) nodes.set(child, childValue)
  }
  return nodes
}

/**
 * Compare the documented keys with the default config files, both ways.
 * Returns the keys a config can set, in config.json order (group keys
 * dropped, and a free-form object without a default on its page given the one
 * from its file), and one line per problem; no problems means the pages and
 * files agree.
 */
export function checkKeys (keys: ConfigKey[], files: DefaultsFile[]): { keys: ConfigKey[], problems: string[] } {
  const problems: string[] = []
  const where = (key: ConfigKey) => `docs${key.page}.md`
  const json = (value: unknown) => JSON.stringify(value)

  // Every config node, and the file it was first found in
  const nodes = new Map<string, { value: unknown, file: string }>()
  for (const file of files) {
    for (const [path, value] of flatten(file.config)) {
      const seen = nodes.get(path)
      if (!seen) nodes.set(path, { value, file: file.name })
      else if (!isObject(seen.value) && !sameValue(seen.value, value)) {
        problems.push(`\`${path}\` is ${json(seen.value)} in ${seen.file} but ${json(value)} in ${file.name}`)
      }
    }
  }

  const documented = new Map<string, ConfigKey>()
  for (const key of keys) {
    const twin = documented.get(key.path)
    if (twin) problems.push(`\`${key.path}\` is documented twice, in ${where(twin)} and ${where(key)}`)
    else documented.set(key.path, key)
  }
  // An object key with keys documented under it is a group; one without is free-form
  const isGroup = (key: ConfigKey) => key.type === 'object' && keys.some(other => other.path.startsWith(key.path + '.'))
  const isFreeForm = (key: ConfigKey) => key.type === 'object' && !isGroup(key)

  const fields: ConfigKey[] = []
  for (const key of documented.values()) {
    const node = nodes.get(key.path)
    if (!node) {
      problems.push(`\`${key.path}\` is documented in ${where(key)} but is in neither ${files.map(file => file.name).join(' nor ')}`)
      continue
    }
    if (!matchesType(key.type, node.value)) {
      problems.push(`\`${key.path}\` is documented as \`${key.type}\` in ${where(key)} but is ${json(node.value)} in ${node.file}`)
      continue
    }
    if (isGroup(key)) continue
    if (key.default === undefined) {
      if (!isFreeForm(key)) problems.push(`\`${key.path}\` has no default in ${where(key)}`)
    } else if (!sameValue(key.default, node.value)) {
      problems.push(`\`${key.path}\` defaults to ${json(key.default)} in ${where(key)} but to ${json(node.value)} in ${node.file}`)
    }
    if (key.values && !key.values.some(allowed => sameValue(allowed.value, node.value))) {
      problems.push(`the allowed values of \`${key.path}\` in ${where(key)} do not include its default, ${json(node.value)}`)
    }
    for (const allowed of key.values ?? []) {
      if (!matchesType(key.type, allowed.value)) {
        problems.push(`the allowed value ${json(allowed.value)} of \`${key.path}\` in ${where(key)} is not a \`${key.type}\``)
      }
    }
    fields.push(key.default === undefined ? { ...key, default: node.value } : key)
  }

  // The other direction: every leaf in the files is documented itself, or sits inside a free-form object
  const covered = (path: string) => {
    if (documented.has(path)) return true
    const parts = path.split('.')
    for (let length = parts.length - 1; length > 0; length--) {
      const ancestor = documented.get(parts.slice(0, length).join('.'))
      if (ancestor && isFreeForm(ancestor)) return true
    }
    return false
  }
  for (const [path, node] of nodes) {
    const isLeaf = !isObject(node.value) || Object.keys(node.value).length === 0
    if (isLeaf && !covered(path)) problems.push(`\`${path}\` in ${node.file} is not documented on any page in docs/config`)
  }
  const order = [...nodes.keys()]
  fields.sort((a, b) => order.indexOf(a.path) - order.indexOf(b.path))
  return { keys: fields, problems }
}

/** One row of the tables on Renamed config keys. */
export interface RenamedKey {
  /** The old dotted path. */
  from: string
  /** The current dotted path. */
  to: string
  /** The Current key cell as markdown, which can say how the values changed. */
  note: string
}

/**
 * Read the renamed keys from config/upgrading.md: every table with `Old key`
 * and `Current key` columns, taking the first inline-code path in each cell.
 */
export function parseRenamedKeys (markdown: string): RenamedKey[] {
  const renamed: RenamedKey[] = []
  for (const block of toBlocks(markdown)) {
    if (block.kind !== 'table') continue
    const [header, ...rows] = block.rows
    const from = header.indexOf('Old key')
    const to = header.indexOf('Current key')
    if (from === -1 || to === -1) continue
    for (const row of rows) {
      const oldPath = /`([^`]+)`/.exec(row[from])?.[1]
      const newPath = /`([^`]+)`/.exec(row[to])?.[1]
      if (oldPath && newPath) renamed.push({ from: oldPath, to: newPath, note: row[to] })
    }
  }
  return renamed
}
