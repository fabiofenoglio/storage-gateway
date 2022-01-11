/* eslint-disable @typescript-eslint/no-explicit-any */
import {Model, model, property} from '@loopback/repository';
import {AuditFieldsUpdateRequest} from '../dto/audit-fields-update-request.model';

@model()
export class UpdateMetadataRequest extends Model {
  @property({
    type: 'any',
  })
  value: any;

  @property({
    type: AuditFieldsUpdateRequest,
  })
  audit?: AuditFieldsUpdateRequest;

  constructor(data?: Partial<UpdateMetadataRequest>) {
    super(data);
  }
}
