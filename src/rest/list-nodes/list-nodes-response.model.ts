import {model, property} from '@loopback/repository';
import {StorageNodeResumeDto} from '../node-resource/storage-node-resume-dto.model';
import {PagedResponse} from '../pagination/paged-response.model';

@model()
export class ListNodesResponse extends PagedResponse<StorageNodeResumeDto> {
  @property({
    type: 'array',
    required: true,
    itemType: StorageNodeResumeDto,
  })
  content: StorageNodeResumeDto[];

  constructor(data?: Partial<ListNodesResponse>) {
    super(data);
  }
}
