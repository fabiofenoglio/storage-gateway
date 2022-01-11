import {ContentStreamer} from '../content/content-streamer.model';

export interface CommonS3PutObjectRequest {
  Bucket: string;
  Key: string;
  estimatedSize?: number;
}

export interface CommonS3PutObjectOutput {
  ETag?: string;
  VersionId?: string;
}

export interface CommonS3GetObjectContentRequest {
  Bucket: string;
  Key: string;
  TotalSize: number;
}

export interface CommonS3DeleteObjectRequest {
  Bucket: string;
  Key: string;
}

export interface CommonS3GetObjectOutput {
  contentProvider: () => Promise<ContentStreamer>;
  StatusCode?: number;
  ContentLength?: number;
  ETag?: string;
  VersionId?: string;
  ContentType?: string;
}

export type CommonS3GetObjectContentOutput = ContentStreamer;

export interface CommonS3Blob {}
export type CommonS3Body = Buffer | Uint8Array | CommonS3Blob | string;
