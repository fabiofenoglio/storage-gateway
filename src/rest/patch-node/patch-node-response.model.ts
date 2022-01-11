import {model} from '@loopback/repository';
import {StorageNodeDetailDto} from '../node-resource/storage-node-detail-dto.model';

@model()
export class PatchNodeResponse extends StorageNodeDetailDto {
  constructor(data?: Partial<PatchNodeResponse>) {
    super(data);
  }
}
