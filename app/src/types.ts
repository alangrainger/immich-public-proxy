export enum AssetType {
  image = 'IMAGE',
  video = 'VIDEO'
}

export interface Asset {
  id: string;
  key: string;
  originalFileName?: string;
  password?: string;
  fileCreatedAt: string;
  type: AssetType;
  isTrashed: boolean;
}

export interface SharedLink {
  key: string;
  type: string;
  description?: string;
  assets: Asset[];
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
  key: string;
  password?: string;
  mode?: string;
  size?: ImageSize;
  range?: string;
}
