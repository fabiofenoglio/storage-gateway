import {Model, model, property} from '@loopback/repository';
import {AuditFieldsUpdateRequest} from '../dto/audit-fields-update-request.model';
import {PatchMetadataRequest} from './patch-metadata-request.model';

@model({
  name: 'PatchNodeRequest',
})
export class PatchNodeRequest extends Model {
  @property({
    type: 'string',
  })
  name?: string;

  @property({
    type: 'array',
    itemType: PatchMetadataRequest,
  })
  metadata?: PatchMetadataRequest[];

  @property({
    type: AuditFieldsUpdateRequest,
  })
  audit?: AuditFieldsUpdateRequest;

  constructor(data?: Partial<PatchNodeRequest>) {
    super(data);
  }
}
