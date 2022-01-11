import {model, property} from '@loopback/repository';
import {NodeShareDto} from '../dto/node-share-dto.model';
import {PagedResponse} from '../pagination/paged-response.model';

@model()
export class ListNodeSharesResponse extends PagedResponse<NodeShareDto> {
  @property({
    type: 'array',
    required: true,
    itemType: NodeShareDto,
  })
  content: NodeShareDto[];

  constructor(data?: Partial<ListNodeSharesResponse>) {
    super(data);
  }
}
