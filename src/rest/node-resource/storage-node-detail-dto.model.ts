import {model} from '@loopback/repository';
import {StorageNodeResumeDto} from './storage-node-resume-dto.model';

@model()
export class StorageNodeDetailDto extends StorageNodeResumeDto {
  constructor(data?: Partial<StorageNodeDetailDto>) {
    super(data);
  }
}
