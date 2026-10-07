import { getConfigOption, getNumericConfigOption } from '@ipp/core'

const MB = 1024 * 1024

/** IPP's public URL from `GALLERY_URL`, without a trailing slash, or undefined when unset. */
export function galleryUrl (): string | undefined {
  return (process.env.GALLERY_URL || '').replace(/\/+$/, '') || undefined
}

/** Largest single file accepted, in bytes, from `ipp.upload.maxFileSize` (MB). */
export function maxFileSize (): number {
  return Math.max(1, getNumericConfigOption('ipp.upload.maxFileSize', 500)) * MB
}

/** Files per minute per visitor address and share, from `ipp.upload.rateLimit`. `0` is no limit. */
export function rateLimit (): number {
  return getNumericConfigOption('ipp.upload.rateLimit', 60)
}

/** Bytes accepted per share per hour, from `ipp.upload.byteBudget` (MB). `0` is no limit. */
export function byteBudget (): number {
  return Math.max(0, getNumericConfigOption('ipp.upload.byteBudget', 10240)) * MB
}

/** Prefix for every stored filename, from `ipp.upload.filenamePrefix`. */
export function filenamePrefix (): string {
  const configured = getConfigOption('ipp.upload.filenamePrefix', 'ipp_upload_')
  return typeof configured === 'string' ? configured : ''
}

/** Notification webhook settings from `ipp.upload.notify*`, or undefined when no URL is set. */
export function notifyConfig (): { url: string, headers: Record<string, string>, timeoutMs: number } | undefined {
  const url = getConfigOption('ipp.upload.notifyUrl', '')
  if (typeof url !== 'string' || !url) return undefined
  const headers: Record<string, string> = {}
  const configured = getConfigOption('ipp.upload.notifyHeaders', {})
  if (configured && typeof configured === 'object' && !Array.isArray(configured)) {
    for (const [name, value] of Object.entries(configured as Record<string, unknown>)) {
      if (typeof value === 'string') headers[name] = value
    }
  }
  return { url, headers, timeoutMs: getNumericConfigOption('ipp.upload.notifyTimeout', 10_000) }
}
