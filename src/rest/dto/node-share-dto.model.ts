import {model, Model, property} from '@loopback/repository';
import {AuditFieldsDto} from './audit-fields-dto.model';

@model()
export class NodeShareDto extends Model {
  @property({
    type: 'string',
    required: true,
  })
  uuid: string;

  @property({
    type: 'string',
    required: true,
  })
  accessToken: string;

  @property({
    type: 'string',
    required: true,
  })
  type: string;

  @property({
    type: AuditFieldsDto,
  })
  audit: AuditFieldsDto;

  @property({
    type: 'string',
  })
  shareUrl: string;

  constructor(data?: Partial<NodeShareDto>) {
    super(data);
  }
}
