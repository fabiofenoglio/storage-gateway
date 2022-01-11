import {model, Model, property} from '@loopback/repository';

@model()
export class AuditFieldsUpdateRequest extends Model {
  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      type: 'integer',
      format: 'int64',
    },
  })
  version: number;

  constructor(data?: Partial<AuditFieldsUpdateRequest>) {
    super(data);
  }
}
