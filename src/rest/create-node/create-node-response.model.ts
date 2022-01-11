import {model} from '@loopback/repository';
import {StorageNodeDetailDto} from '../node-resource/storage-node-detail-dto.model';

@model()
export class CreateNodeResponse extends StorageNodeDetailDto {
  constructor(data?: Partial<CreateNodeResponse>) {
    super(data);
  }
}
