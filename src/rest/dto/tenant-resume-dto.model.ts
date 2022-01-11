import {model, Model, property} from '@loopback/repository';
import {BackboneResumeDto} from './backbone-resume-dto.model';

@model()
export class TenantResumeDto extends Model {
  @property({
    type: 'string',
    required: true,
  })
  code: string;

  @property({
    type: 'string',
    required: true,
  })
  name: string;

  @property({
    type: 'string',
    required: true,
  })
  backboneType: string;

  @property({
    type: BackboneResumeDto,
    required: true,
  })
  backbone: BackboneResumeDto;

  constructor(data?: Partial<TenantResumeDto>) {
    super(data);
  }
}
