import { Request } from 'express-serve-static-core'
import { KeyType } from '@ipp/core'

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
  // UTC offset (hours, may be fractional) at the time each photo was taken.
  // Applying it to fileCreatedAt yields the photographer's local time.
  localOffsetHours: number[];
  // Motion photo (Live Photo) clip id; null for ordinary assets.
  livePhotoVideoId: (string | null)[];
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
