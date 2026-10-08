import { readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { checkKeys, LABELS, parsePage, parseRenamedKeys, type ConfigKey, type RenamedKey } from './configSchema'

/*
  The Node half of the config schema: reads the reference pages and the
  default config files from disk, and fails the docs build when they
  disagree. The parsing and the checks themselves are in configSchema.ts.
*/

const DOCS_CONFIG_DIR = fileURLToPath(new URL('../config/', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
/** The default config files, as repo paths. Both containers can share one config, so they are checked as one. */
const DEFAULTS_FILES = ['app/config.json', 'upload-app/config.json']

/**
 * Read every page in docs/config and both default config files, and check
 * them against each other. Returns `checkKeys`' keys, the renamed keys from
 * config/upgrading.md, and every problem, the pages' own format problems
 * first. A renamed key whose current name no page documents is a problem too,
 * and so is a label in `LABELS` for a key no page documents.
 */
export function readConfigSchema (): { keys: ConfigKey[], renamed: RenamedKey[], problems: string[] } {
  const keys: ConfigKey[] = []
  const problems: string[] = []
  for (const file of readdirSync(DOCS_CONFIG_DIR).filter(name => name.endsWith('.md')).sort()) {
    const page = parsePage(readFileSync(join(DOCS_CONFIG_DIR, file), 'utf8'), '/config/' + basename(file, '.md'))
    keys.push(...page.keys)
    problems.push(...page.problems)
  }
  const files = DEFAULTS_FILES.map(name => ({ name, config: JSON.parse(readFileSync(join(REPO_ROOT, name), 'utf8')) }))
  const checked = checkKeys(keys, files)
  problems.push(...checked.problems)

  const renamed = parseRenamedKeys(readFileSync(join(DOCS_CONFIG_DIR, 'upgrading.md'), 'utf8'))
  const documented = new Set(checked.keys.map(key => key.path))
  for (const { from, to } of renamed) {
    if (!documented.has(to)) problems.push(`docs/config/upgrading.md: \`${from}\` is renamed to \`${to}\`, which no page documents`)
  }
  for (const path of Object.keys(LABELS)) {
    if (!documented.has(path)) problems.push(`docs/.vitepress/configSchema.ts: LABELS has a label for \`${path}\`, which no page documents`)
  }
  return { keys: checked.keys, renamed, problems }
}

/** The check's problems as one message, or undefined when there are none. */
function problemsMessage (): string | undefined {
  const { problems } = readConfigSchema()
  if (problems.length === 0) return undefined
  return 'The config reference pages (docs/config) and the default config files disagree. ' +
    'See "Config reference pages" in docs/README.md.\n' + problems.map(problem => '  - ' + problem).join('\n')
}

/**
 * Fails `vitepress build` when the config reference pages and the default
 * config files disagree, so a mismatch never deploys. `vitepress dev` only
 * warns, at start and again when a page or a default config file changes, so
 * a half-edited page doesn't stop the server.
 */
export function configCheckPlugin (): Plugin {
  const repoFiles = DEFAULTS_FILES.map(name => join(REPO_ROOT, name))
  const isChecked = (file: string) =>
    repoFiles.includes(resolve(file)) || (resolve(file).startsWith(DOCS_CONFIG_DIR) && file.endsWith('.md'))
  let isBuild = false
  return {
    name: 'ipp-config-check',
    configResolved (config) {
      isBuild = config.command === 'build'
    },
    buildStart () {
      const message = problemsMessage()
      if (message && isBuild) this.error(message)
      else if (message) this.warn(message)
    },
    configureServer (server) {
      // Outside the docs folder, so Vite doesn't watch them unless told to
      server.watcher.add(repoFiles)
    },
    handleHotUpdate ({ file, server }) {
      if (!isChecked(file)) return
      const message = problemsMessage()
      if (message) server.config.logger.warn(message)
    }
  }
}
