import {ContentStreamer} from './content-streamer.model';

export interface RawUploadDto {
  files: RawUploadFileDto[];
  fields: {
    [key: string]: string;
  };
  parsedData?: unknown;
}

export interface RawUploadFileDto {
  originalname?: string;
  fieldname?: string;
  encoding?: string;
  mimetype?: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  content?: Buffer;
}

export interface UploadedContent {
  content: ContentStreamer;
  originalname?: string;
  fieldname?: string;
  encoding?: string;
  mimetype?: string;
  size: number;
  destination?: string;
  filename?: string;
  hashes?: UploadedContentHashes;
  version?: number;
}

export interface UploadedContentPart {
  content: ContentStreamer;
  encoding?: string;
  size: number;
  destination?: string;
  hashes?: UploadedContentHashes;
}

export type UploadedContentHashes = {
  md5?: string;
  sha1?: string;
  sha256?: string;
};

export type SupportedHash = 'md5' | 'sha1' | 'sha256';
export const supportedHashesList: SupportedHash[] = ['md5', 'sha1', 'sha256'];

export enum SupportedHashes {
  MD5 = 'md5',
  SHA1 = 'sha1',
  SHA256 = 'sha256',
}
