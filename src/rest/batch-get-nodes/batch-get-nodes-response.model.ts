import {model, property} from '@loopback/repository';
import {StorageNodeResumeDto} from '../node-resource';
import {PagedResponse} from '../pagination';

@model({
  name: 'BatchGetNodesResponse',
})
export class BatchGetNodesResponse extends PagedResponse<StorageNodeResumeDto> {
  @property({
    type: 'array',
    required: true,
    itemType: StorageNodeResumeDto,
  })
  content: StorageNodeResumeDto[];

  constructor(data?: Partial<BatchGetNodesResponse>) {
    super(data);
  }
}
