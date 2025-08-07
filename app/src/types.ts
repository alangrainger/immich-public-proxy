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
}

export enum AlbumType {
  album = 'ALBUM',
  individual = 'INDIVIDUAL'
}

export interface Asset {
  id: string;
  key: string;
  originalFileName?: string;
  originalMimeType: string;
  password?: string;
  fileCreatedAt?: string; // May not exist - see https://github.com/alangrainger/immich-public-proxy/issues/61
  type: AssetType;
  isTrashed: boolean;
  exifInfo?: ExifInfo;
}

export interface Album {
  id: string;
  assets: Asset[];
}

export interface SharedLink {
  key: string;
  type: string;
  description?: string;
  assets: Asset[];
  allowDownload?: boolean;
  password?: string;
  album?: {
    id: string;
    albumName?: string;
    order?: string;
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
  mode?: string;
  password?: string;
  asset?: string; // Optional asset ID for deep-linking
  size?: ImageSize;
  range?: string;
}

export enum DownloadAll {
  disabled,
  perImmich,
  always
}
