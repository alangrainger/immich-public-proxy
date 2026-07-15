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
  originalMimeType?: string;
  password?: string;
  fileCreatedAt?: string; // May not exist - see https://github.com/alangrainger/immich-public-proxy/issues/61
  type: AssetType;
  isTrashed: boolean;
  exifInfo?: ExifInfo;
  width?: number;
  height?: number;
  // Base64-encoded thumbhash for tasteful blur placeholders during lazy-load
  thumbhash?: string;
  // True for album assets enumerated via the timeline API, which give us only
  // grid fields (id, type, ratio, thumbhash, isTrashed, fileCreatedAt). Their
  // exif / originalFileName / description are fetched lazily when the asset is
  // opened in the lightbox (see the `/meta/` route + client/metadata.ts).
  needsDetail?: boolean;
}

/**
 * Immich server version as returned by `GET /server/version`.
 */
export interface ImmichVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * One entry of `GET /timeline/buckets` - a time bucket (month) and its count.
 */
export interface TimelineBucket {
  timeBucket: string;
  count: number;
}

/**
 * `GET /timeline/bucket` columnar (struct-of-arrays) response. Each array is
 * index-aligned: element `i` of every array describes the same asset. Only
 * the fields the gallery grid needs are typed here; Immich returns more.
 */
export interface TimelineBucketAssets {
  id: string[];
  isImage: boolean[];
  // width / height ratio (Immich's `ratio` already accounts for orientation)
  ratio: number[];
  thumbhash: (string | null)[];
  isTrashed: boolean[];
  fileCreatedAt: string[];
}

export interface SharedLink {
  key: string;
  keyType: KeyType;
  type: string;
  description?: string;
  assets: Asset[];
  allowDownload?: boolean;
  showMetadata?: boolean;
  password?: string;
  album?: {
    id: string;
    albumName?: string;
    order?: string;
    description?: string;
    albumThumbnailAssetId?: string;
    assetCount?: number;
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
  fullsize = 'fullsize',
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
