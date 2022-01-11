import {model, Model, property} from '@loopback/repository';
import {ContentDto, MetadataDto} from '../dto';
import {AuditFieldsDto} from '../dto/audit-fields-dto.model';

@model()
export class StorageNodeResumeDto extends Model {
  @property({
    type: 'string',
    required: true,
  })
  uuid: string;

  @property({
    type: 'string',
    required: true,
  })
  type: string;

  @property({
    type: 'string',
    required: true,
  })
  name: string;

  @property({
    type: 'string',
  })
  parent?: string;

  @property({
    type: AuditFieldsDto,
  })
  audit: AuditFieldsDto;

  @property({
    type: ContentDto,
  })
  content?: ContentDto;

  @property({
    type: 'array',
    required: true,
    itemType: MetadataDto,
  })
  metadata: MetadataDto[];

  constructor(data?: Partial<StorageNodeResumeDto>) {
    super(data);
  }
}
