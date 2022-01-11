import {model, property} from '@loopback/repository';
import {MetadataDto} from '../dto/metadata-dto.model';
import {PagedResponse} from '../pagination/paged-response.model';

@model()
export class ListMetadataResponse extends PagedResponse<MetadataDto> {
  @property({
    type: 'array',
    required: true,
    itemType: MetadataDto,
  })
  content: MetadataDto[];

  constructor(data?: Partial<ListMetadataResponse>) {
    super(data);
  }
}
