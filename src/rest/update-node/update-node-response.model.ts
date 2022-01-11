import {model} from '@loopback/repository';
import {StorageNodeDetailDto} from '../node-resource/storage-node-detail-dto.model';

@model()
export class UpdateNodeResponse extends StorageNodeDetailDto {
  constructor(data?: Partial<UpdateNodeResponse>) {
    super(data);
  }
}
