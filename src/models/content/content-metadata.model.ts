import {model, Model, property} from '@loopback/repository';
import {ContentAssetMetadata} from './content-asset-metadata.model';
import {ContentMetadataHashes} from './content-metadata-hashes.model';
import {ContentMetadataImage} from './content-metadata-image.model';
import {ContentMetadataVideo} from './content-metadata-video.model';

@model()
export class ContentMetadata extends Model {
  @property({
    type: 'number',
  })
  engineVersion?: number;

  @property({
    type: 'array',
    itemType: 'string',
  })
  facets?: string[];

  @property({
    type: 'date',
  })
  processedAt?: Date;

  @property({
    type: 'string',
  })
  contentETag?: string;

  @property({
    type: ContentMetadataHashes,
  })
  hashes?: ContentMetadataHashes;

  @property({
    type: ContentMetadataImage,
  })
  image?: ContentMetadataImage;

  @property({
    type: ContentMetadataVideo,
  })
  video?: ContentMetadataVideo;

  @property({
    type: 'array',
    itemType: ContentAssetMetadata,
  })
  assets?: ContentAssetMetadata[];

  @property({
    type: 'boolean',
  })
  ready?: boolean;

  constructor(data?: Partial<ContentMetadata>) {
    super(data);
  }
}
