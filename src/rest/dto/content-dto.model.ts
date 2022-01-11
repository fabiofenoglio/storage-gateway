import {model, Model, property} from '@loopback/repository';
import {AuditFieldsDto} from './audit-fields-dto.model';
import {ContentEncryptionMetadataDto} from './content-encryption-metadata-dto.model';
import {ContentMetadataDto} from './content-metadata-dto.model';

@model()
export class ContentDto extends Model {
  @property({
    type: 'string',
    required: true,
  })
  key: string;

  @property({
    type: 'string',
    required: true,
  })
  mimeType: string;

  @property({
    type: 'string',
    required: true,
  })
  encoding: string;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      type: 'integer',
      format: 'int64',
    },
  })
  contentSize: number;

  @property({
    type: 'string',
    required: true,
  })
  originalName: string;

  @property({
    type: AuditFieldsDto,
  })
  audit: AuditFieldsDto;

  @property({
    type: ContentMetadataDto,
  })
  metadata?: ContentMetadataDto;

  @property({
    type: ContentEncryptionMetadataDto,
  })
  encryption?: ContentEncryptionMetadataDto;

  constructor(data?: Partial<ContentDto>) {
    super(data);
  }
}
