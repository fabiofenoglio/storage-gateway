/* eslint-disable @typescript-eslint/no-explicit-any */
import {model, property} from '@loopback/repository';
import {BaseFilter} from './base-filter.model';

@model()
export class AnyFilter extends BaseFilter<any> {
  @property({
    type: 'any',
  })
  equals?: any;

  @property({
    type: 'any',
  })
  notEquals?: any;

  @property({
    type: 'array',
    itemType: 'any',
  })
  in?: any[];

  @property({
    type: 'array',
    itemType: 'any',
  })
  notIn?: any[];

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

  @property({
    type: 'string',
  })
  like?: string;

  @property({
    type: 'string',
  })
  notLike?: string;

  constructor(data?: Partial<AnyFilter>) {
    super(data);
  }
}
