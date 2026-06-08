import { Request } from 'express-serve-static-core'

export enum AssetType {
  image = 'IMAGE',
  video = 'VIDEO'
}

export enum KeyType {
  key = 'key',
  slug = 'slug'
}

export interface ExifInfo {
  description?: string;
  exifImageWidth?: number;
  exifImageHeight?: number;
  // EXIF orientation string ("1".."8") or null. Values 5-8 indicate the image
  // is rotated 90°/270°, so the displayed aspect ratio swaps width/height.
  orientation?: string | null;
  // Additional EXIF fields surfaced by Immich for the metadata sidebar
  // (gated server-side by ipp.showMetadata.exif.* and .location.* config).
  dateTimeOriginal?: string | null;
  fileSizeInByte?: number | null;
  make?: string | null;
  model?: string | null;
  lensModel?: string | null;
  exposureTime?: string | null;
  iso?: number | null;
  fNumber?: number | null;
  focalLength?: number | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export enum AlbumType {
  album = 'ALBUM',
  individual = 'INDIVIDUAL'
}

export interface Asset {
  id: string;
  key: string;
  keyType: KeyType;
  originalFileName?: string;
  originalMimeType: string;
  password?: string;
  fileCreatedAt?: string; // May not exist - see https://github.com/alangrainger/immich-public-proxy/issues/61
  type: AssetType;
  isTrashed: boolean;
  exifInfo?: ExifInfo;
  width?: number;
  height?: number;
  // Base64-encoded thumbhash for tasteful blur placeholders during lazy-load
  thumbhash?: string;
}

export interface Album {
  id: string;
  assets: Asset[];
  albumThumbnailAssetId?: string;
}

export interface SharedLink {
  key: string;
  keyType: KeyType;
  type: string;
  description?: string;
  assets: Asset[];
  allowDownload?: boolean;
  // Per-share "Show metadata" toggle from Immich. When `false`, the share owner
  // has asked that no EXIF / location / description / filename metadata be
  // surfaced to viewers. We treat this as a kill-switch over the operator's
  // own `ipp.showMetadata.*` config: see `gallery/builder.ts`.
  showMetadata?: boolean;
  password?: string;
  album?: {
    id: string;
    albumName?: string;
    order?: string;
    description?: string;
    albumThumbnailAssetId?: string;
  }
  expiresAt: string | null;
}

export interface SharedLinkResult {
  valid: boolean;
  key?: string;
  passwordRequired?: boolean;
  link?: SharedLink;
}

export enum ImageSize {
  thumbnail = 'thumbnail',
  preview = 'preview',
  original = 'original'
}

export interface IncomingShareRequest {
  req: Request;
  key: string;
  keyType?: KeyType;
  password?: string;
  mode?: string;
  size?: ImageSize;
  range?: string;
}

export enum DownloadAll {
  disabled,
  perImmich,
  always
}
