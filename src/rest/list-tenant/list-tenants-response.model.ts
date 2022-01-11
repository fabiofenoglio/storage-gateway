import {model, property} from '@loopback/repository';
import {TenantResumeDto} from '../dto';
import {PagedResponse} from '../pagination/paged-response.model';

@model()
export class ListTenantsResponse extends PagedResponse<TenantResumeDto> {
  @property({
    type: 'array',
    required: true,
    itemType: TenantResumeDto,
  })
  content: TenantResumeDto[];

  constructor(data?: Partial<ListTenantsResponse>) {
    super(data);
  }
}
