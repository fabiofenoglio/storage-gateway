import {model, property} from '@loopback/repository';
import {BaseFilter} from './base-filter.model';

@model()
export class StringFilter extends BaseFilter<string> {
  @property({
    type: 'string',
  })
  equals?: string;

  @property({
    type: 'string',
  })
  notEquals?: string;

  @property({
    type: 'array',
    itemType: 'string',
  })
  in?: string[];

  @property({
    type: 'array',
    itemType: 'string',
  })
  notIn?: string[];

  @property({
    type: 'string',
  })
  like?: string;

  @property({
    type: 'string',
  })
  notLike?: string;

  constructor(data?: Partial<StringFilter>) {
    super(data);
  }
}
