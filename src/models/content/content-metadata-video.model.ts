import {model, Model, property} from '@loopback/repository';
import {ContentMetadataImageThumbnail} from './content-metadata-image-thumbnail.model';

@model()
export class ContentMetadataVideo extends Model {
  @property({
    type: 'array',
    itemType: ContentMetadataImageThumbnail,
  })
  thumbnails?: ContentMetadataImageThumbnail[];

  /** Number of pixels wide (EXIF orientation is not taken into consideration) */
  @property({
    type: 'number',
  })
  width?: number;

  /** Number of pixels high (EXIF orientation is not taken into consideration) */
  @property({
    type: 'number',
  })
  height?: number;

  @property({
    type: 'number',
  })
  duration?: number;

  constructor(data?: Partial<ContentMetadataVideo>) {
    super(data);
  }
}
