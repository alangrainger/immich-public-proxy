/*
  Upload rules the page client and the server both apply: the client filters
  with them before anything leaves the browser, the server decides with them.
*/

/** `accept` attribute for the file picker: the camera roll on a phone. */
export const UPLOAD_ACCEPT = 'image/*,video/*'

/**
 * Whether a file of this media type may be sent. Any image or video except
 * SVG, the one image type a browser may execute. Immich types an asset by its
 * extension and refuses anything outside its own list, so the finer check is
 * left to Immich.
 */
export function isUploadableType (mimeType: string): boolean {
  const type = (mimeType || '').split(';')[0].trim().toLowerCase()
  if (type === 'image/svg+xml') return false
  return type.startsWith('image/') || type.startsWith('video/')
}

/*
  Types for files a desktop browser reports with an empty or generic `File.type`: HEIC,
  HEIF, camera RAW and some video containers. Immich types the asset by its
  extension, so these only need to pass `isUploadableType`.
*/
const TYPE_BY_EXTENSION: Record<string, string> = {
  heic: 'image/heic',
  heif: 'image/heif',
  hif: 'image/heif',
  avif: 'image/avif',
  jxl: 'image/jxl',
  dng: 'image/x-adobe-dng',
  cr2: 'image/x-canon-cr2',
  cr3: 'image/x-canon-cr3',
  nef: 'image/x-nikon-nef',
  nrw: 'image/x-nikon-nrw',
  arw: 'image/x-sony-arw',
  raf: 'image/x-fuji-raf',
  orf: 'image/x-olympus-orf',
  rw2: 'image/x-panasonic-rw2',
  pef: 'image/x-pentax-pef',
  srw: 'image/x-samsung-srw',
  mts: 'video/mp2t',
  m2ts: 'video/mp2t',
  mkv: 'video/x-matroska',
  insv: 'video/mp4'
}

/**
 * The browser's type for a file, or one derived from its extension when the
 * browser gives none or a generic one (Chrome reports HEIC from the file
 * picker as `application/octet-stream`).
 */
export function fileType (name: string, browserType: string): string {
  if (isUploadableType(browserType)) return browserType
  const extension = name.split('.').pop()?.toLowerCase() || ''
  return TYPE_BY_EXTENSION[extension] || browserType
}

/** Bytes as a short human-readable string. */
export function formatSize (bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB'
  return bytes + ' bytes'
}

/** Page settings the server renders into the init JSON for the client. */
export interface UploadPageConfig {
  /** Path of this share's upload endpoint, including any mount prefix. */
  uploadUrl: string
  /** Largest single file the server accepts, in bytes. */
  maxFileSize: number
  /** Share title, for the drop overlay and the completion message. */
  title: string
}

/** Success body of `POST <share>/upload`. */
export interface UploadResponse {
  status: 'created' | 'duplicate'
}

/** Failure body of `POST <share>/upload`. */
export interface UploadErrorResponse {
  error: string
}
