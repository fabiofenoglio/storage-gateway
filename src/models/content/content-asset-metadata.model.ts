import {model, Model, property} from '@loopback/repository';
import {ContentEncryptionMetadata} from './content-encryption-metadata.model';
import {IContentMetadata} from './content-models.model';

@model()
export class ContentAssetMetadata extends Model implements IContentMetadata {
  @property({
    type: 'string',
  })
  key: string;

  @property({
    type: 'string',
  })
  mimeType?: string;

  @property({
    type: 'number',
  })
  contentSize?: number;

  @property({
    type: 'string',
  })
  fileName?: string;

  @property({
    type: 'string',
  })
  contentETag?: string;

  @property({
    type: 'string',
  })
  url?: string;

  @property({
    type: 'string',
  })
  remoteId?: string;

  @property({
    type: ContentEncryptionMetadata,
    required: false,
    mysql: {
      dataType: 'varchar',
      dataLength: 500,
    },
  })
  encryption?: ContentEncryptionMetadata;

  constructor(data?: Partial<ContentAssetMetadata>) {
    super(data);
  }
}
