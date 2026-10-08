import { createMarkdownRenderer, defineLoader, type DefaultTheme, type SiteConfig } from 'vitepress'
import { readConfigSchema } from '../../configCheck'
import { keyLabel, type ConfigType } from '../../configSchema'

/*
  Build-time data for the config generator (a VitePress data loader): the
  keys from the reference pages, with their descriptions rendered to HTML,
  grouped into one section per page in sidebar order. Dev mode reloads it when
  a watched file changes. Pages and defaults that disagree fail the build in
  configCheck.ts, not here.
*/

/** A config key as the generator shows it. */
export interface GeneratorField {
  path: string
  /** The key's name as words, e.g. "Show arrows" for `ipp.lightbox.showArrows`. */
  label: string
  type: ConfigType
  default: unknown
  /** The allowed values, each with a plain-text label for a select. */
  values?: Array<{ value: unknown, label: string }>
  /** The key's description, as HTML. */
  html: string
  /** The key's section on its reference page. */
  link: string
  /** For a row of a flag table, the label of the key the table is under, e.g. "EXIF". */
  group?: string
}

/** One reference page's keys. */
export interface GeneratorSection {
  /** The page's sidebar label. */
  title: string
  fields: GeneratorField[]
}

/** A renamed key, for the paste box to suggest the current name. */
export interface GeneratorRenamedKey {
  from: string
  /** The Current key cell from Renamed config keys, as HTML. */
  html: string
}

export interface GeneratorData {
  sections: GeneratorSection[]
  renamed: GeneratorRenamedKey[]
}

declare const data: GeneratorData
export { data }

/** Every sidebar link with its label, depth first, in sidebar order. */
function sidebarLinks (items: DefaultTheme.SidebarItem[]): Array<{ link: string, text: string }> {
  return items.flatMap(item => [
    ...(item.link && item.text ? [{ link: item.link, text: item.text }] : []),
    ...sidebarLinks(item.items ?? [])
  ])
}

/** Markdown as plain text, for a `<select>` option: links keep their text, formatting goes. */
function toPlainText (markdown: string): string {
  return markdown.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '')
}

/** A value as the select shows it: strings without quotes, the rest as JSON. */
function display (value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

export default defineLoader({
  watch: ['../../../config/*.md', '../../../../app/config.json', '../../../../upload-app/config.json'],
  async load (): Promise<GeneratorData> {
    const config: SiteConfig = (globalThis as unknown as { VITEPRESS_CONFIG: SiteConfig }).VITEPRESS_CONFIG
    const md = await createMarkdownRenderer(config.srcDir, config.markdown, config.site.base, config.logger)
    // A `#anchor` link in a description points at its own page, not at the generator
    const render = (markdown: string, page: string) => md.renderInline(markdown.replace(/\]\(#/g, `](${page}#`))

    const { keys, renamed } = readConfigSchema()
    const sidebar = config.site.themeConfig.sidebar
    const pages = sidebarLinks(Array.isArray(sidebar) ? sidebar : [])
    const sections = pages.flatMap(({ link, text }) => {
      const fields = keys.filter(key => key.page === link).map((key): GeneratorField => ({
        path: key.path,
        label: keyLabel(key.path),
        type: key.type,
        default: key.default,
        values: key.values?.map(({ value, description }) => ({ value, label: `${display(value)} - ${toPlainText(description)}` })),
        html: render(key.description, key.page),
        link: `${key.page}#${key.anchor}`,
        group: key.group && keyLabel(key.path.slice(0, key.path.lastIndexOf('.')))
      }))
      return fields.length ? [{ title: text, fields }] : []
    })

    return {
      sections,
      renamed: renamed.map(({ from, note }) => ({ from, html: render(note, '/config/upgrading') }))
    }
  }
})
