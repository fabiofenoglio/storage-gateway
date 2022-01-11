import {model, Model, property} from '@loopback/repository';
import {ContentMetadataHashesDto} from './content-metadata-hashes-dto.model';
import {ContentMetadataImageDto} from './content-metadata-image-dto.model';
import {ContentMetadataVideoDto} from './content-metadata-video-dto.model';

@model()
export class ContentMetadataDto extends Model {
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
    type: ContentMetadataHashesDto,
  })
  hashes?: ContentMetadataHashesDto;

  @property({
    type: ContentMetadataImageDto,
  })
  image?: ContentMetadataImageDto;

  @property({
    type: ContentMetadataVideoDto,
  })
  video?: ContentMetadataVideoDto;

  @property({
    type: 'boolean',
  })
  ready?: boolean;

  constructor(data?: Partial<ContentMetadataDto>) {
    super(data);
  }
}
