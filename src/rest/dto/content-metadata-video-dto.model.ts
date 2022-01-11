import {model, Model, property} from '@loopback/repository';
import {ContentMetadataImageThumbnailDto} from './content-metadata-image-thumbnail-dto.model';

@model()
export class ContentMetadataVideoDto extends Model {
  @property({
    type: 'array',
    itemType: ContentMetadataImageThumbnailDto,
  })
  thumbnails?: ContentMetadataImageThumbnailDto[];

  /** Number of pixels wide (EXIF orientation is not taken into consideration) */
  @property({
    type: 'number',
    jsonSchema: {
      type: 'integer',
      format: 'int32',
    },
  })
  width?: number;

  /** Number of pixels high (EXIF orientation is not taken into consideration) */
  @property({
    type: 'number',
    jsonSchema: {
      type: 'integer',
      format: 'int32',
    },
  })
  height?: number;

  @property({
    type: 'number',
    jsonSchema: {
      type: 'integer',
      format: 'int32',
    },
  })
  duration?: number;

  constructor(data?: Partial<ContentMetadataVideoDto>) {
    super(data);
  }
}
