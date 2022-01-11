import {model, Model, property} from '@loopback/repository';
import {ContentMetadataImageThumbnailDto} from './content-metadata-image-thumbnail-dto.model';

@model()
export class ContentMetadataImageDto extends Model {
  @property({
    type: 'array',
    itemType: ContentMetadataImageThumbnailDto,
  })
  thumbnails?: ContentMetadataImageThumbnailDto[];

  /** Name of decoder used to decompress image data e.g. jpeg, png, webp, gif, svg */
  @property({
    type: 'string',
  })
  format?: string;

  /** Total size of image in bytes, for Stream and Buffer input only */
  @property({
    type: 'number',
    jsonSchema: {
      type: 'integer',
      format: 'int64',
    },
  })
  size?: number;

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

  /** Name of pixel depth format e.g. uchar, char, ushort, float ... */
  @property({
    type: 'string',
  })
  depth?: string;

  /** Number of pixels per inch (DPI), if present */
  @property({
    type: 'number',
    jsonSchema: {
      type: 'integer',
      format: 'int32',
    },
  })
  density?: number;

  /** Boolean indicating the presence of an alpha transparency channel */
  @property({
    type: 'boolean',
  })
  hasAlpha?: boolean;

  constructor(data?: Partial<ContentMetadataImageDto>) {
    super(data);
  }
}
