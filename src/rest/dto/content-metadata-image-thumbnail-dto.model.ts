import {model, Model, property} from '@loopback/repository';

@model()
export class ContentMetadataImageThumbnailDto extends Model {
  @property({
    type: 'string',
  })
  assetKey: string;

  @property({
    type: 'string',
  })
  fileName?: string;

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

  constructor(data?: Partial<ContentMetadataImageThumbnailDto>) {
    super(data);
  }
}
