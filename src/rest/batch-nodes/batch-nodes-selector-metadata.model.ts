import {Model, model, property} from '@loopback/repository';
import {StringFilter} from '../filter';
import {AnyFilter} from '../filter/any-filter.model';

@model()
export class BatchNodesSelectorMetadataRequest extends Model {
  @property({
    type: StringFilter,
  })
  key: StringFilter;

  @property({
    type: AnyFilter,
  })
  value: AnyFilter;

  @property({
    type: 'array',
    itemType: 'any',
  })
  and?: BatchNodesSelectorMetadataRequest[];

  @property({
    type: 'array',
    itemType: 'any',
  })
  or?: BatchNodesSelectorMetadataRequest[];

  constructor(data?: Partial<BatchNodesSelectorMetadataRequest>) {
    super(data);
  }
}
