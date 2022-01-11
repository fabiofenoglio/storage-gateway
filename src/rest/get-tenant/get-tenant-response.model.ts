import {model} from '@loopback/repository';
import {TenantResumeDto} from '../dto/tenant-resume-dto.model';

@model()
export class GetTenantResponse extends TenantResumeDto {
  constructor(data?: Partial<GetTenantResponse>) {
    super(data);
  }
}
