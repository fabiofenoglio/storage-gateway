import {Model, model, property} from '@loopback/repository';
import {StorageNodeShareType} from '../../models/storage-node-share.model';
import {EnumFilter} from '../filter';

@model()
export class ListNodeSharesRequest extends Model {
  @property({
    type: EnumFilter,
  })
  type?: EnumFilter<StorageNodeShareType>;

  constructor(data?: Partial<ListNodeSharesRequest>) {
    super(data);
  }
}
