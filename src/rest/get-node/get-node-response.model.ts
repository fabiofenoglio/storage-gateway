import {model} from '@loopback/repository';
import {StorageNodeDetailDto} from '../node-resource/storage-node-detail-dto.model';

@model({
  name: 'GetNodeResponse',
})
export class GetNodeResponse extends StorageNodeDetailDto {
  constructor(data?: Partial<GetNodeResponse>) {
    super(data);
  }
}
