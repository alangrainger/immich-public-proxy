import { AlbumType, log, SharedLink, title } from '@ipp/core'
import { formatSize } from './shared/upload'
import { notifyConfig } from './config'

/*
  Optional upload notification: one JSON POST per stored file to
  `ipp.upload.notifyUrl`, for ntfy, Gotify, Home Assistant and the like.
  The payload never carries the share key, slug or password.
*/

export interface UploadNotification {
  title: string
  message: string
  data: {
    event: 'upload'
    time: string
    share: { type: 'album' | 'individual', id: string, title: string }
    file: { name: string, size: number, type: string }
    asset: { id: string, status: 'created' | 'duplicate' }
    /** The visitor's name as stored in the filename, or empty when none was given. */
    uploader: string
  }
}

/**
 * Build the notification body for one stored file. `title` and `message` are
 * top level so a receiver expecting a flat shape shows something readable
 * with no mapping; everything structured lives under `data`.
 */
export function buildNotification (
  share: SharedLink,
  file: { name: string, size: number, type: string },
  asset: { id: string, status: 'created' | 'duplicate' },
  uploader = ''
): UploadNotification {
  const isAlbum = share.type === AlbumType.album
  const shareTitle = title(share)
  const sender = uploader ? ` by ${uploader}` : ''
  return {
    title: 'Photo sent to ' + shareTitle,
    message: `${file.name} (${formatSize(file.size)}) was uploaded to ${shareTitle}${sender}.`,
    data: {
      event: 'upload',
      time: new Date().toISOString(),
      share: {
        type: isAlbum ? 'album' : 'individual',
        // An album share is named by its album, an individual share by the link
        id: (isAlbum ? share.album?.id : share.id) || '',
        title: shareTitle
      },
      file,
      asset,
      uploader
    }
  }
}

/**
 * Post the notification, if one is configured. Fire and forget: a timeout,
 * no retry, failures logged and swallowed. Only the URL's host is logged,
 * because ntfy topics and Gotify tokens live in the URL.
 */
export async function sendNotification (notification: UploadNotification): Promise<void> {
  const config = notifyConfig()
  if (!config) return
  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...config.headers },
      body: JSON.stringify(notification),
      signal: AbortSignal.timeout(config.timeoutMs)
    })
    if (!res.ok) log.warn('Upload notification to ' + hostOf(config.url) + ' answered ' + res.status)
  } catch (e) {
    log.warn('Upload notification to ' + hostOf(config.url) + ' failed: ' + (e instanceof Error ? e.message : String(e)))
  }
}

function hostOf (url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'an invalid URL'
  }
}
