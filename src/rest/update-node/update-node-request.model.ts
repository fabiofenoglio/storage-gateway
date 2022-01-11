import {Model, model, property} from '@loopback/repository';
import {AuditFieldsUpdateRequest} from '../dto/audit-fields-update-request.model';
import {UpdateNodeMetadataRequest} from './update-node-metadata-request.model';

@model()
export class UpdateNodeRequest extends Model {
  @property({
    type: 'string',
    required: true,
  })
  name: string;

  @property({
    type: 'array',
    itemType: UpdateNodeMetadataRequest,
  })
  metadata?: UpdateNodeMetadataRequest[];

  @property({
    type: AuditFieldsUpdateRequest,
  })
  audit?: AuditFieldsUpdateRequest;

  constructor(data?: Partial<UpdateNodeRequest>) {
    super(data);
  }
}
