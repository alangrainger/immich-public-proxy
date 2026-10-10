<script lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { isObject, matchesType, sameValue } from '../../configSchema'
import { data, type GeneratorField } from './configGenerator.data'

/** How a field is edited. The text kinds keep a draft, so a half-typed value can be shown with its error. */
type Kind = 'switch' | 'select' | 'text' | 'number' | 'json' | 'jsonArea'

/** A problem with one key of a loaded config. `html` is trusted, from the docs; the rest is shown as text. */
interface Notice {
  path: string
  message: string
  html?: string
}

const FIELDS = data.sections.flatMap(section => section.fields)
const BY_PATH = new Map(FIELDS.map(field => [field.path, field]))
const RENAMED = new Map(data.renamed.map(key => [key.from, key.html]))

/** A JSON copy, so the form never shares an object with the defaults or with a pasted config. */
function clone<T> (value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value))
}

function kindOf (field: GeneratorField): Kind {
  if (field.values) return 'select'
  if (field.type === 'bool') return 'switch'
  if (field.type === 'string') return 'text'
  if (field.type === 'int') return 'number'
  if (field.type === 'object') return 'jsonArea'
  return 'json'
}

const hasDraft = (field: GeneratorField) => ['number', 'json', 'jsonArea'].includes(kindOf(field))

function toDraft (field: GeneratorField, value: unknown): string {
  if (kindOf(field) === 'number') return String(value)
  return kindOf(field) === 'jsonArea' ? JSON.stringify(value, null, 2) : JSON.stringify(value)
}

/** Whether a key takes a value: one of its allowed values, or any value of its type. */
function accepts (field: GeneratorField, value: unknown): boolean {
  return field.values ? field.values.some(allowed => sameValue(allowed.value, value)) : matchesType(field.type, value)
}

/*
  The form's state is kept at module scope rather than in setup, so it
  survives following a link to a reference page and coming back. A reload
  starts again from the defaults, or from the link's config.
*/
const values = reactive<Record<string, unknown>>({})
const drafts = reactive<Record<string, string>>({})
const errors = reactive<Record<string, string>>({})
const pasteError = ref('')
const notices = ref<Notice[]>([])

function setValue (field: GeneratorField, value: unknown) {
  values[field.path] = clone(value)
  if (hasDraft(field)) drafts[field.path] = toDraft(field, value)
  delete errors[field.path]
}

function resetAll () {
  for (const field of FIELDS) setValue(field, field.default)
}
resetAll()

/** Reset the form and clear what the paste box reported. */
function startOver () {
  resetAll()
  notices.value = []
  pasteError.value = ''
}

/** Read a text field. A value that doesn't parse leaves the last good one in place and shows why. */
function onDraft (field: GeneratorField, text: string) {
  drafts[field.path] = text
  let value: unknown
  if (kindOf(field) === 'number') {
    value = text.trim() === '' ? NaN : Number(text)
    if (!Number.isInteger(value)) {
      errors[field.path] = 'Enter a whole number.'
      return
    }
  } else {
    try {
      value = JSON.parse(text)
    } catch {
      errors[field.path] = 'This is not valid JSON.'
      return
    }
    if (!matchesType(field.type, value)) {
      errors[field.path] = field.type === 'object' ? 'Enter a JSON object, such as {}.' : 'Enter true, false or a string in quotes.'
      return
    }
  }
  values[field.path] = value
  delete errors[field.path]
}

/** Reset the form, then set every key of a config that the docs know, and report the rest. */
function loadConfig (config: Record<string, unknown>): Notice[] {
  resetAll()
  const found: Notice[] = []
  const isGroup = (path: string) => FIELDS.some(field => field.path.startsWith(path + '.'))
  const walk = (node: unknown, path: string) => {
    const field = BY_PATH.get(path)
    if (field) {
      if (accepts(field, node)) setValue(field, node)
      else found.push({ path, message: 'has a value this key does not take, so it was left at its default.' })
    } else if (isObject(node) && (isGroup(path) || Object.keys(node).length > 0)) {
      // Into unknown objects too, so a renamed key inside one is still found
      for (const [name, child] of Object.entries(node)) walk(child, path + '.' + name)
    } else if (isGroup(path)) {
      found.push({ path, message: 'must be an object of keys, so it was left out.' })
    } else if (RENAMED.has(path)) {
      found.push({ path, message: 'was renamed, so it was left out. Current key:', html: RENAMED.get(path) })
    } else {
      found.push({ path, message: 'is not a key IPP reads, so it was left out.' })
    }
  }
  for (const [name, child] of Object.entries(config)) walk(child, name)
  return found
}

/** Read the paste box. Text around the JSON is ignored, so the whole `CONFIG: |` block can be pasted. */
function loadPasted (text: string) {
  let config: unknown
  try {
    config = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  } catch {}
  if (!isObject(config)) {
    pasteError.value = 'This is not a JSON object. Paste the contents of config.json, or the JSON in your CONFIG variable.'
    return
  }
  pasteError.value = ''
  notices.value = loadConfig(config)
}

const isChanged = (field: GeneratorField) => !sameValue(values[field.path], field.default)

/** The changed keys, nested as in config.json and in config.json order. */
const output = computed(() => {
  const config: Record<string, unknown> = {}
  for (const field of FIELDS.filter(isChanged)) {
    const parts = field.path.split('.')
    let node = config
    for (const part of parts.slice(0, -1)) node = (node[part] ??= {}) as Record<string, unknown>
    node[parts[parts.length - 1]] = values[field.path]
  }
  return config
})
const changedCount = computed(() => FIELDS.filter(isChanged).length)
const configJson = computed(() => JSON.stringify(output.value, null, 2))
const configEnv = computed(() => 'CONFIG: |\n' + configJson.value.split('\n').map(line => '  ' + line).join('\n'))
const hasErrors = computed(() => Object.keys(errors).length > 0)

/** A section's fields, with each flag table's rows gathered into one block under the key they belong to. */
type Block = { field: GeneratorField } | { group: string, path: string, link: string, fields: GeneratorField[] }
const SECTIONS = data.sections.map(section => {
  const blocks: Block[] = []
  for (const field of section.fields) {
    const last = blocks[blocks.length - 1]
    if (field.group && last && 'group' in last && last.group === field.group) last.fields.push(field)
    else if (field.group) blocks.push({ group: field.group, path: field.path.replace(/\.[^.]+$/, ''), link: field.link, fields: [field] })
    else blocks.push({ field })
  }
  return { title: section.title, blocks }
})

/** The words a field is found by: its section, flag table, label, key and description, in lower case. */
const SEARCH_TEXT = new Map(data.sections.flatMap(section => section.fields.map(field =>
  [field.path, [section.title, field.group, field.label, field.path, field.html.replace(/<[^>]*>/g, '')].join(' ').toLowerCase()]
)))

// With the form at module scope, so the filter is still applied after a Details link and back
const filter = ref('')

/** The sections with only the fields that contain every word typed, or all of them while the box is empty. */
const visibleSections = computed(() => {
  const words = filter.value.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return SECTIONS
  const matches = (field: GeneratorField) => words.every(word => SEARCH_TEXT.get(field.path)?.includes(word))
  return SECTIONS.flatMap(section => {
    const blocks = section.blocks.flatMap((block): Block[] => {
      if ('field' in block) return matches(block.field) ? [block] : []
      const fields = block.fields.filter(matches)
      return fields.length ? [{ ...block, fields }] : []
    })
    return blocks.length ? [{ ...section, blocks }] : []
  })
})

const fieldId = (field: GeneratorField) => 'ipp-cg-' + field.path
</script>

<script setup lang="ts">
const pasted = ref('')
const tab = ref<'json' | 'env'>('json')
const loadOpen = ref(false)
const copied = ref<'' | 'config' | 'link'>('')
const copyFailed = ref(false)

async function copy (text: string, what: 'config' | 'link') {
  try {
    await navigator.clipboard.writeText(text)
    copyFailed.value = false
    copied.value = what
    setTimeout(() => { if (copied.value === what) copied.value = '' }, 2000)
  } catch {
    copyFailed.value = true
  }
}

/** This page's address with the changed keys in the hash, which the browser never sends to the server. */
const shareLink = computed(() =>
  location.origin + location.pathname + '#config=' + encodeURIComponent(JSON.stringify(output.value)))

function selectValue (field: GeneratorField, event: Event) {
  const index = Number((event.target as HTMLSelectElement).value)
  setValue(field, field.values?.[index].value)
}

const selectedIndex = (field: GeneratorField) =>
  field.values?.findIndex(allowed => sameValue(allowed.value, values[field.path])) ?? -1

const onLoadToggle = (event: Event) => { loadOpen.value = (event.target as HTMLDetailsElement).open }
const showOutput = () => document.getElementById('ipp-cg-output')?.scrollIntoView({ behavior: 'smooth' })

onMounted(() => {
  if (!location.hash.startsWith('#config=')) return
  let config: unknown
  try {
    config = JSON.parse(decodeURIComponent(location.hash.slice('#config='.length)))
  } catch {}
  if (isObject(config)) notices.value = loadConfig(config)
  else pasteError.value = 'The config in this link could not be read.'
  loadOpen.value = notices.value.length > 0 || pasteError.value !== ''
  // Clear the hash, so a reload after more changes doesn't bring the link's config back
  history.replaceState(history.state, '', location.pathname + location.search)
})
</script>

<template>
  <div class="ipp-cg">
    <div class="layout">
      <div class="form">
        <details class="load" :open="loadOpen" @toggle="onLoadToggle">
          <summary>Start from your current config</summary>
          <p>Paste your <code>config.json</code>, or your <code>CONFIG</code> variable. It replaces what is set below.</p>
          <textarea v-model="pasted" class="input code" rows="6" placeholder='{ "ipp": { "showHomePage": false } }' spellcheck="false" />
          <button type="button" class="button" @click="loadPasted(pasted)">Load</button>
          <p v-if="pasteError" class="error">{{ pasteError }}</p>
          <template v-if="notices.length">
            <p>
              Some keys were not loaded. Keys from older versions are listed in
              <a href="/config/upgrading">Renamed config keys</a>.
            </p>
            <ul class="notices">
              <li v-for="notice in notices" :key="notice.path">
                <code>{{ notice.path }}</code> {{ notice.message }} <span v-if="notice.html" v-html="notice.html" />
              </li>
            </ul>
          </template>
        </details>

        <h2>Config options</h2>
        <div class="filter">
          <input
            v-model="filter"
            class="input"
            type="search"
            placeholder="Filter options, e.g. video"
            aria-label="Filter options"
            spellcheck="false"
          >
          <button v-if="filter" type="button" class="clear" aria-label="Clear filter" @click="filter = ''">×</button>
        </div>
        <p v-if="filter && visibleSections.length === 0" class="empty">No options match "{{ filter }}".</p>

        <section v-for="section in visibleSections" :key="section.title">
          <h3>{{ section.title }}</h3>
          <template v-for="block in section.blocks" :key="'field' in block ? block.field.path : block.path">
            <div v-if="'field' in block" class="field" :class="{ changed: isChanged(block.field) }">
              <div class="head">
                <label :for="fieldId(block.field)" :title="block.field.path">{{ block.field.label }}</label>
                <input
                  v-if="kindOf(block.field) === 'switch'"
                  :id="fieldId(block.field)"
                  type="checkbox"
                  role="switch"
                  class="switch"
                  :checked="values[block.field.path] === true"
                  @change="setValue(block.field, ($event.target as HTMLInputElement).checked)"
                >
                <button v-if="isChanged(block.field)" type="button" class="reset" @click="setValue(block.field, block.field.default)">
                  Reset
                </button>
              </div>
              <p class="description">
                <span v-html="block.field.html" /> <a :href="block.field.link">Details</a>
              </p>
              <select
                v-if="kindOf(block.field) === 'select'"
                :id="fieldId(block.field)"
                class="input"
                :value="selectedIndex(block.field)"
                @change="selectValue(block.field, $event)"
              >
                <option v-for="(allowed, index) in block.field.values" :key="index" :value="index">{{ allowed.label }}</option>
              </select>
              <input
                v-else-if="kindOf(block.field) === 'text'"
                :id="fieldId(block.field)"
                class="input"
                type="text"
                spellcheck="false"
                :value="values[block.field.path]"
                @input="setValue(block.field, ($event.target as HTMLInputElement).value)"
              >
              <input
                v-else-if="kindOf(block.field) === 'number' || kindOf(block.field) === 'json'"
                :id="fieldId(block.field)"
                class="input"
                :class="{ code: kindOf(block.field) === 'json', invalid: errors[block.field.path] }"
                :type="kindOf(block.field) === 'number' ? 'number' : 'text'"
                :step="kindOf(block.field) === 'number' ? 1 : undefined"
                spellcheck="false"
                :value="drafts[block.field.path]"
                @input="onDraft(block.field, ($event.target as HTMLInputElement).value)"
              >
              <textarea
                v-else-if="kindOf(block.field) === 'jsonArea'"
                :id="fieldId(block.field)"
                class="input code"
                :class="{ invalid: errors[block.field.path] }"
                rows="4"
                spellcheck="false"
                :value="drafts[block.field.path]"
                @input="onDraft(block.field, ($event.target as HTMLTextAreaElement).value)"
              />
              <p v-if="errors[block.field.path]" class="error">{{ errors[block.field.path] }}</p>
            </div>

            <fieldset v-else class="field flags" :class="{ changed: block.fields.some(isChanged) }">
              <legend :title="block.path">{{ block.group }} <a class="details" :href="block.link">Details</a></legend>
              <label v-for="field in block.fields" :key="field.path" class="flag">
                <input
                  type="checkbox"
                  :checked="values[field.path] === true"
                  @change="setValue(field, ($event.target as HTMLInputElement).checked)"
                >
                <span :title="field.path"><span class="flag-label">{{ field.label }}</span> <span class="flag-description" v-html="field.html" /></span>
              </label>
            </fieldset>
          </template>
        </section>
      </div>

      <aside id="ipp-cg-output" class="output">
        <div class="tabs" role="tablist">
          <button type="button" role="tab" :aria-selected="tab === 'json'" @click="tab = 'json'">config.json</button>
          <button type="button" role="tab" :aria-selected="tab === 'env'" @click="tab = 'env'">CONFIG variable</button>
        </div>
        <p v-if="changedCount === 0" class="empty">
          Nothing differs from the defaults, so no config file is needed.
        </p>
        <template v-else>
          <pre class="code-block"><code>{{ tab === 'json' ? configJson : configEnv }}</code></pre>
          <p v-if="tab === 'json'" class="hint">
            Save it as <code>config.json</code> and <a href="/config/#mount-a-file">mount it</a>. If you run the upload
            service, mount the same file into that container too.
          </p>
          <p v-else class="hint">
            Add it under <code>environment:</code> in <code>docker-compose.yml</code>, indented like the other
            variables. If you run the upload service, give that container the same <code>CONFIG</code> too. See
            <a href="/config/#inline-via-env-var">Inline via env var</a>.
          </p>
          <p v-if="hasErrors" class="error">
            A field has a value that can't be read. Until it is fixed, the output keeps that key's last good value.
          </p>
          <div class="actions">
            <button type="button" class="button" @click="copy(tab === 'json' ? configJson : configEnv, 'config')">
              {{ copied === 'config' ? 'Copied' : 'Copy' }}
            </button>
            <button type="button" class="button secondary" @click="copy(shareLink, 'link')">
              {{ copied === 'link' ? 'Link copied' : 'Copy link to this config' }}
            </button>
            <button type="button" class="button secondary" @click="startOver">Reset all</button>
          </div>
          <p v-if="copyFailed" class="error">Copying didn't work in this browser. Select the text and copy it instead.</p>
          <p class="hint">Anyone you send the link to sees every value in it, including any token.</p>
        </template>
      </aside>
    </div>

    <button v-if="changedCount > 0" type="button" class="jump" @click="showOutput">
      {{ changedCount }} {{ changedCount === 1 ? 'key' : 'keys' }} changed · Show config
    </button>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  gap: 32px;
}

.load,
.output {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 12px 16px;
  background: var(--vp-c-bg-soft);
}

.load summary {
  cursor: pointer;
  font-weight: 600;
}

.field {
  margin: 16px 0;
  padding: 4px 0 4px 12px;
  border: 0;
  border-left: 3px solid transparent;
}

.field.changed {
  border-left-color: var(--vp-c-brand-1);
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.head label {
  font-weight: 600;
}

.vp-doc .description {
  margin: 4px 0 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}

.flags {
  min-width: 0;
}

.flags legend {
  padding: 0;
  font-weight: 600;
}

.flags .details {
  margin-left: 8px;
  font-size: 14px;
  font-weight: 400;
}

.flag {
  display: flex;
  gap: 10px;
  align-items: baseline;
  margin: 6px 0;
  font-size: 14px;
  line-height: 1.6;
  cursor: pointer;
}

.flag-label {
  font-weight: 500;
}

.flag-description {
  color: var(--vp-c-text-2);
}

.input {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  font-size: 14px;
}

.input:focus {
  border-color: var(--vp-c-brand-1);
}

.input.invalid {
  border-color: var(--vp-c-danger-1);
}

/* The theme turns off the native arrow (`appearance: none`), so draw one; the grey reads on both themes */
select.input {
  padding-right: 32px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238e8e93' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-position: right 10px center;
  background-repeat: no-repeat;
  background-size: 16px;
  cursor: pointer;
}

.code {
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
}

textarea.input {
  resize: vertical;
}

.filter {
  position: relative;
}

.filter .input {
  padding-right: 36px;
}

/* One clear button, ours, on every browser */
.filter .input::-webkit-search-cancel-button {
  appearance: none;
}

.filter .clear {
  position: absolute;
  top: 0;
  right: 0;
  width: 36px;
  height: 100%;
  color: var(--vp-c-text-2);
  font-size: 20px;
  line-height: 1;
}

.filter .clear:hover {
  color: var(--vp-c-text-1);
}

.switch {
  appearance: none;
  position: relative;
  flex-shrink: 0;
  width: 40px;
  height: 22px;
  border: 1px solid var(--vp-input-border-color);
  border-radius: 11px;
  background: var(--vp-input-switch-bg-color);
  cursor: pointer;
  transition: background-color 0.25s, border-color 0.25s;
}

.switch::before {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--vp-c-neutral-inverse);
  box-shadow: var(--vp-shadow-1);
  transition: transform 0.25s;
}

.switch:checked {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
}

.switch:checked::before {
  transform: translateX(18px);
  background: var(--vp-c-white);
}

.switch:focus-visible,
.button:focus-visible,
.reset:focus-visible,
.clear:focus-visible,
.tabs button:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

/* The theme's own button colours, so contrast holds in dark mode */
.button {
  margin-top: 8px;
  padding: 4px 14px;
  border-radius: 6px;
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  font-size: 14px;
  font-weight: 500;
}

.button:hover {
  background: var(--vp-button-brand-hover-bg);
}

.button.secondary {
  background: var(--vp-button-alt-bg);
  color: var(--vp-button-alt-text);
}

.button.secondary:hover {
  background: var(--vp-button-alt-hover-bg);
}

.reset {
  margin-left: auto;
  color: var(--vp-c-brand-1);
  font-size: 13px;
}

.error {
  color: var(--vp-c-danger-1);
  font-size: 14px;
}

.vp-doc .notices {
  font-size: 14px;
}

.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.tabs button {
  padding: 6px 10px;
  border-bottom: 2px solid transparent;
  color: var(--vp-c-text-2);
  font-size: 14px;
  font-weight: 500;
}

.tabs button[aria-selected='true'] {
  border-bottom-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
}

.code-block {
  margin: 12px 0 8px;
  padding: 12px;
  overflow-x: auto;
  border-radius: 6px;
  background: var(--vp-code-block-bg);
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.5;
}

.vp-doc .hint,
.vp-doc .empty {
  margin: 8px 0;
  font-size: 14px;
  color: var(--vp-c-text-2);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.jump {
  position: sticky;
  bottom: 16px;
  display: block;
  margin: 16px 0 0 auto;
  padding: 8px 16px;
  border-radius: 20px;
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  font-size: 14px;
  font-weight: 500;
  box-shadow: var(--vp-shadow-3);
}

/* Side by side once there is room for both, with the output kept in view */
@media (min-width: 1280px) {
  .layout {
    grid-template-columns: minmax(0, 1fr) 400px;
  }

  .output {
    position: sticky;
    top: calc(var(--vp-nav-height) + 24px);
    align-self: start;
    max-height: calc(100vh - var(--vp-nav-height) - 48px);
    overflow-y: auto;
  }

  .jump {
    display: none;
  }
}
</style>
