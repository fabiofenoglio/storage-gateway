/* eslint-disable @typescript-eslint/no-explicit-any */
import {model, Model, property} from '@loopback/repository';
import {AuditFieldsDto} from './audit-fields-dto.model';

@model()
export class MetadataDto extends Model {
  @property({
    type: 'string',
    required: true,
  })
  key: string;

  @property({
    type: 'any',
  })
  value: any;

  @property({
    type: AuditFieldsDto,
  })
  audit: AuditFieldsDto;

  constructor(data?: Partial<MetadataDto>) {
    super(data);
  }
}
