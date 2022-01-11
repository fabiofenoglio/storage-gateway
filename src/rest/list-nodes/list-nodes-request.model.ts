import {Model, model, property} from '@loopback/repository';
import {StorageNodeType} from '../../models/storage-node.model';
import {StringFilter} from '../filter';
import {EnumFilter} from '../filter/enum-filter.model';

@model()
export class ListNodesRequest extends Model {
  @property({
    type: StringFilter,
  })
  name?: StringFilter;

  @property({
    type: EnumFilter,
  })
  type?: EnumFilter<StorageNodeType>;

  constructor(data?: Partial<ListNodesRequest>) {
    super(data);
  }
}
