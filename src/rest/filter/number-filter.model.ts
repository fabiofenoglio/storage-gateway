import {model, property} from '@loopback/repository';
import {BaseFilter} from './base-filter.model';

@model()
export class NumberFilter extends BaseFilter<number> {
  @property({
    type: 'number',
  })
  equals?: number;

  @property({
    type: 'number',
  })
  notEquals?: number;

  @property({
    type: 'array',
    itemType: 'number',
  })
  in?: number[];

  @property({
    type: 'array',
    itemType: 'number',
  })
  notIn?: number[];

  @property({
    type: 'number',
  })
  greaterThan?: number;

  @property({
    type: 'number',
  })
  greaterOrEqualThan?: number;

  @property({
    type: 'number',
  })
  lessThan?: number;

  @property({
    type: 'number',
  })
  lessOrEqualThan?: number;

  constructor(data?: Partial<NumberFilter>) {
    super(data);
  }
}
