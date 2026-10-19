#!/usr/bin/env node

/*
  Bulk-tag visitor uploads by the name in their filename. The owner runs it in
  the upload container with their own Immich API key, which the upload
  service itself never holds:

    docker exec -e IMMICH_API_KEY=<key> ipp-upload node dist/tag-uploads.js [--apply]

  `ipp_upload_jane-smith,IMG_0042.jpg` gets the tag `Uploaded/jane-smith`.
  Without --apply it only reports what it would tag. A re-run is safe: Immich
  skips a tag that an asset already has.
*/

import 'dotenv/config'
import { resolve } from 'path'
import { parseArgs } from 'util'
import { apiUrl, loadConfig } from '@ipp/core'
import { fieldSeparator, filenamePrefix } from './config'
import { isUsableSeparator, readUploadFilename, storedPrefix } from './filename'

/** Immich's largest page for `POST /search/metadata`. */
const SEARCH_PAGE_SIZE = 1000
/** Assets per `PUT /tags/assets` call. */
const TAG_BATCH_SIZE = 500
const DEFAULT_PARENT = 'Uploaded'
const PERMISSIONS = 'asset.read, user.read, tag.create and tag.asset'

const USAGE = `Tag visitor uploads in Immich by the name in their filename.

Usage: node dist/tag-uploads.js [--apply] [--parent <tag>] [--prefix <text>] [--separator <char>]

  --apply              Add the tags. Without it, only report what would be tagged.
  --parent <tag>       Parent tag for the visitor tags. Default "${DEFAULT_PARENT}".
  --prefix <text>      Filename prefix to look for. Default ipp.upload.filenamePrefix.
  --separator <char>   Field separator to read. Default ipp.upload.fieldSeparator.

IMMICH_API_KEY must hold an API key of the share owner, with the permissions
${PERMISSIONS}.`

/** What `tagUploads` is told to do. */
export interface TagOptions {
  apiKey: string
  apply: boolean
  parent: string
  prefix: string
  separator: string
  /** Where each report line goes. */
  print: (line: string) => void
}

/** What `tagUploads` found and did. */
export interface TagSummary {
  /** Asset IDs per visitor name. */
  named: Map<string, string[]>
  anonymous: number
  unreadable: number
  /** Assets that got a tag they did not have. Always 0 in a dry run. */
  tagged: number
}

/** The fields of an Immich `AssetResponseDto` that the script reads. */
interface Asset {
  id: string
  ownerId: string
  originalFileName: string
  visibility: string
  isTrashed: boolean
}

/** A failed Immich call, with a message fit for the owner. */
export class ImmichError extends Error {}

/** One JSON call to the Immich API, authenticated with the owner's key. */
async function immich<T> (apiKey: string, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl() + path, {
      method,
      headers: {
        'x-api-key': apiKey,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  } catch (e) {
    throw new ImmichError('Could not reach Immich at ' + apiUrl() + ': ' + (e instanceof Error ? e.message : String(e)))
  }
  if (!res.ok) {
    const reply = await res.json().catch(() => null) as { message?: unknown } | null
    const message = Array.isArray(reply?.message) ? reply?.message.join(', ') : reply?.message
    let text = method + ' ' + path + ' failed with status ' + res.status
    if (typeof message === 'string' && message) text += ': ' + message
    if (res.status === 401) text += '. Check IMMICH_API_KEY.'
    if (res.status === 403) text += '. The API key needs the permissions ' + PERMISSIONS + '.'
    throw new ImmichError(text)
  }
  return await res.json() as T
}

/**
 * The key owner's assets whose filename starts with `prefix`. Immich's
 * filename search is a case-insensitive substring match that also returns
 * partners' photos, so each result is checked here. Trashed assets and the
 * hidden video half of a motion photo are left out.
 */
async function findUploads (apiKey: string, prefix: string): Promise<Asset[]> {
  const me = await immich<{ id: string }>(apiKey, 'GET', '/users/me')
  const found: Asset[] = []
  let page: string | null = '1'
  while (page) {
    const reply: { assets: { items: Asset[], nextPage: string | null } } = await immich(apiKey, 'POST', '/search/metadata', {
      originalFileName: prefix,
      page: Number(page),
      size: SEARCH_PAGE_SIZE
    })
    for (const asset of reply.assets.items) {
      if (asset.ownerId !== me.id || asset.isTrashed || asset.visibility === 'hidden') continue
      if (asset.originalFileName.startsWith(prefix)) found.push(asset)
    }
    page = reply.assets.nextPage
  }
  return found
}

/** `count` and the noun, singular or plural. */
function files (count: number): string {
  return count + (count === 1 ? ' file' : ' files')
}

/**
 * Find the visitor uploads, report them, and with `apply` add a
 * `<parent>/<name>` tag to each named one.
 */
export async function tagUploads (options: TagOptions): Promise<TagSummary> {
  const { apiKey, apply, parent, prefix, separator, print } = options
  const summary: TagSummary = { named: new Map(), anonymous: 0, unreadable: 0, tagged: 0 }
  const fileNames = new Map<string, string[]>()

  const uploads = await findUploads(apiKey, prefix)
  print('Found ' + files(uploads.length) + ' starting with "' + prefix + '".')
  for (const asset of uploads) {
    const stored = readUploadFilename(asset.originalFileName, prefix, separator)
    if (!stored || stored.kind === 'anonymous') {
      summary.anonymous++
    } else if (stored.kind === 'unreadable') {
      summary.unreadable++
      print('Skipped ' + asset.originalFileName + ': ' + stored.reason + '.')
    } else {
      summary.named.set(stored.uploader, [...(summary.named.get(stored.uploader) || []), asset.id])
      fileNames.set(stored.uploader, [...(fileNames.get(stored.uploader) || []), asset.originalFileName])
    }
  }

  const names = [...summary.named.keys()].sort()
  const tagIds = new Map<string, string>()
  if (apply && names.length) {
    const tags = await immich<Array<{ id: string, value: string }>>(apiKey, 'PUT', '/tags', {
      tags: names.map(name => parent + '/' + name)
    })
    for (const tag of tags) tagIds.set(tag.value, tag.id)
  }

  print('')
  for (const name of names) {
    const ids = summary.named.get(name) || []
    const tag = parent + '/' + name
    if (!apply) {
      print(tag + ': ' + files(ids.length))
      for (const fileName of (fileNames.get(name) || []).sort()) print('  ' + fileName)
      continue
    }
    const tagId = tagIds.get(tag)
    if (!tagId) throw new ImmichError('Immich did not return the tag ' + tag)
    let added = 0
    for (let start = 0; start < ids.length; start += TAG_BATCH_SIZE) {
      const reply = await immich<{ count: number }>(apiKey, 'PUT', '/tags/assets', {
        tagIds: [tagId],
        assetIds: ids.slice(start, start + TAG_BATCH_SIZE)
      })
      added += reply.count
    }
    summary.tagged += added
    print(tag + ': ' + files(ids.length) + ', ' + added + ' newly tagged')
  }

  if (names.length === 0) print('No file has a visitor name.')
  if (summary.anonymous) print(files(summary.anonymous) + ' with no visitor name, left untagged.')
  if (summary.unreadable) print(files(summary.unreadable) + ' skipped, listed above.')
  print('')
  if (!apply) {
    print('Dry run: nothing was changed. Run again with --apply to add these tags.')
  } else {
    print('Done. Tagged ' + files(summary.tagged) + '. Files that already had their tag were left as they were.')
  }
  return summary
}

/** Read the flags, the environment and the config, run, and return the exit code. */
export async function main (argv: string[]): Promise<number> {
  let values: { apply?: boolean, parent?: string, prefix?: string, separator?: string, help?: boolean }
  try {
    values = parseArgs({
      args: argv,
      options: {
        apply: { type: 'boolean' },
        parent: { type: 'string' },
        prefix: { type: 'string' },
        separator: { type: 'string' },
        help: { type: 'boolean', short: 'h' }
      }
    }).values
  } catch (e) {
    console.error((e instanceof Error ? e.message : String(e)) + '\n\n' + USAGE)
    return 2
  }
  if (values.help) {
    console.log(USAGE)
    return 0
  }

  // The same config file as the service, /app/config.json in the image
  loadConfig({ defaultPath: resolve(__dirname, '../config.json') })
  const usage = (problem: string) => {
    console.error(problem + '\n\n' + USAGE)
    return 2
  }
  const apiKey = process.env.IMMICH_API_KEY || ''
  if (!apiKey) return usage('IMMICH_API_KEY is not set.')
  if (!process.env.IMMICH_URL) return usage('IMMICH_URL is not set.')
  const prefix = storedPrefix(values.prefix ?? filenamePrefix())
  if (!prefix) {
    return usage('The filename prefix is empty, so visitor uploads cannot be told apart from your own photos. ' +
      'Pass --prefix with the prefix the files were stored with.')
  }
  const separator = values.separator ?? fieldSeparator()
  if (!isUsableSeparator(separator, prefix)) return usage('"' + separator + '" cannot be a field separator with the prefix "' + prefix + '".')
  const parent = (values.parent ?? DEFAULT_PARENT).split('/').map(part => part.trim()).filter(Boolean).join('/')
  if (!parent) return usage('The parent tag is empty.')

  try {
    await tagUploads({ apiKey, apply: !!values.apply, parent, prefix, separator, print: line => console.log(line) })
    return 0
  } catch (e) {
    if (!(e instanceof ImmichError)) throw e
    console.error(e.message)
    return 1
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code })
}
