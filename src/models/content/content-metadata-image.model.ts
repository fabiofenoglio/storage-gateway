import {model, Model, property} from '@loopback/repository';
import {ContentMetadataImageThumbnail} from './content-metadata-image-thumbnail.model';

@model()
export class ContentMetadataImage extends Model {
  @property({
    type: 'array',
    itemType: ContentMetadataImageThumbnail,
  })
  thumbnails?: ContentMetadataImageThumbnail[];

  /** Name of decoder used to decompress image data e.g. jpeg, png, webp, gif, svg */
  @property({
    type: 'string',
  })
  format?: string;

  /** Total size of image in bytes, for Stream and Buffer input only */
  @property({
    type: 'number',
  })
  size?: number;

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

  /** Name of colour space interpretation e.g. srgb, rgb, cmyk, lab, b-w ... */
  @property({
    type: 'string',
  })
  space?: string;

  /** Number of bands e.g. 3 for sRGB, 4 for CMYK */
  @property({
    type: 'number',
  })
  channels?: number;

  /** Name of pixel depth format e.g. uchar, char, ushort, float ... */
  @property({
    type: 'string',
  })
  depth?: string;

  /** Number of pixels per inch (DPI), if present */
  @property({
    type: 'number',
  })
  density?: number;

  /** String containing JPEG chroma subsampling, 4:2:0 or 4:4:4 for RGB, 4:2:0:4 or 4:4:4:4 for CMYK */
  @property({
    type: 'string',
  })
  chromaSubsampling?: string;

  /** Boolean indicating whether the image is interlaced using a progressive scan */
  @property({
    type: 'boolean',
  })
  isProgressive?: boolean;

  /** Number of pages/frames contained within the image, with support for TIFF, HEIF, PDF, animated GIF and animated WebP */
  @property({
    type: 'number',
  })
  pages?: number;

  /** Number of pixels high each page in a multi-page image will be. */
  @property({
    type: 'number',
  })
  pageHeight?: number;

  /** Number of times to loop an animated image, zero refers to a continuous loop. */
  @property({
    type: 'number',
  })
  loop?: number;

  /** Delay in ms between each page in an animated image, provided as an array of integers. */
  @property({
    type: 'array',
    itemType: 'number',
  })
  delay?: number[];

  /**  Number of the primary page in a HEIF image */
  @property({
    type: 'number',
  })
  pagePrimary?: number;

  /** Boolean indicating the presence of an embedded ICC profile */
  @property({
    type: 'boolean',
  })
  hasProfile?: boolean;

  /** Boolean indicating the presence of an alpha transparency channel */
  @property({
    type: 'boolean',
  })
  hasAlpha?: boolean;

  constructor(data?: Partial<ContentMetadataImage>) {
    super(data);
  }
}
