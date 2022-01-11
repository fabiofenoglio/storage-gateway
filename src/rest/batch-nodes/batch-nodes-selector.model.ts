import {Model, model, property} from '@loopback/repository';
import {StorageNodeType} from '../../models/storage-node.model';
import {StringFilter} from '../filter';
import {EnumFilter} from '../filter/enum-filter.model';
import {BatchNodesSelectorMetadataRequest} from './batch-nodes-selector-metadata.model';

@model()
export class BatchNodesSelectorRequest extends Model {
  @property({
    type: StringFilter,
  })
  tenant?: StringFilter;

  @property({
    type: StringFilter,
  })
  uuid?: StringFilter;

  @property({
    type: StringFilter,
  })
  name?: StringFilter;

  @property({
    type: EnumFilter,
  })
  type?: EnumFilter<StorageNodeType>;

  @property({
    type: 'array',
    itemType: BatchNodesSelectorMetadataRequest,
  })
  metadata?: BatchNodesSelectorMetadataRequest[];

  constructor(data?: Partial<BatchNodesSelectorRequest>) {
    super(data);
  }
}
