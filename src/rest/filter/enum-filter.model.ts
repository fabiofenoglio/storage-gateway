import {model, property} from '@loopback/repository';
import {BaseFilter} from './base-filter.model';

@model()
export class EnumFilter<X> extends BaseFilter<X> {
  @property({
    type: 'string',
  })
  equals?: X;

  @property({
    type: 'string',
  })
  notEquals?: X;

  @property({
    type: 'array',
    itemType: 'string',
  })
  in?: X[];

  @property({
    type: 'array',
    itemType: 'string',
  })
  notIn?: X[];

  constructor(data?: Partial<EnumFilter<X>>) {
    super(data);
  }
}
