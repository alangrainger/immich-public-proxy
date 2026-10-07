export enum AssetType {
  image = 'IMAGE',
  video = 'VIDEO'
}

/** Immich's asset visibility states, as the API serialises them. */
export enum AssetVisibility {
  timeline = 'timeline',
  archive = 'archive',
  /** The video half of a motion photo, never shown on its own */
  hidden = 'hidden',
  /** The owner's PIN-protected locked folder */
  locked = 'locked'
}

export enum KeyType {
  key = 'key',
  slug = 'slug'
}

export interface ExifInfo {
  description?: string;
  // Additional EXIF fields surfaced by Immich for the metadata sidebar
  // (gated server-side by ipp.showMetadata.exif.* and .location.* config).
  dateTimeOriginal?: string | null;
  timeZone?: string | null;
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
  // Timezone-agnostic "taken" timestamp (photographer's local wall-clock).
  // Immich groups its own timeline by this field. For individual shares it
  // comes straight from the asset DTO; for album grid items it is synthesised
  // from fileCreatedAt + localOffsetHours (see timelineBucketToAssets).
  localDateTime?: string;
  type: AssetType;
  isTrashed: boolean;
  visibility?: AssetVisibility;
  exifInfo?: ExifInfo;
  width?: number;
  height?: number;
  // Base64-encoded thumbhash for tasteful blur placeholders during lazy-load
  thumbhash?: string;
  // Motion photo (Live Photo) clip: a hidden asset authorised by the same key
  livePhotoVideoId?: string;
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

export interface SharedLink {
  // Immich's id for the link itself, not the album
  id?: string;
  key: string;
  keyType: KeyType;
  slug?: string | null;
  type: string;
  description?: string;
  assets: Asset[];
  allowDownload?: boolean;
  // The owner's "Allow public user to upload" toggle
  allowUpload?: boolean;
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
