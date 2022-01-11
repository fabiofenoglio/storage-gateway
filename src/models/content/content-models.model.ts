import {ContentEncryptionMetadata} from './content-encryption-metadata.model';
import {ContentStreamer} from './content-streamer.model';

export interface DeferredContentRetriever extends IContentMetadata {
  contentProvider: () => Promise<ContentStreamer>;
}

export interface ContentWithMetadata extends IContentMetadata {
  content: ContentStreamer;
}

export interface IContentMetadata {
  key: string;
  mimeType?: string;
  contentSize?: number;
  fileName?: string;
  contentETag?: string;
  url?: string;
  encryption?: ContentEncryptionMetadata;
  remoteId?: string;
}
