import {model, Model, property} from '@loopback/repository';

@model()
export class AuditFieldsDto extends Model {
  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      type: 'integer',
      format: 'int64',
    },
  })
  version: number;

  @property({
    type: 'string',
    required: true,
  })
  createdBy: string;

  @property({
    type: 'date',
    required: true,
  })
  createdAt: Date;

  @property({
    type: 'string',
  })
  modifiedBy?: string;

  @property({
    type: 'date',
  })
  modifiedAt?: Date;

  constructor(data?: Partial<AuditFieldsDto>) {
    super(data);
  }
}
