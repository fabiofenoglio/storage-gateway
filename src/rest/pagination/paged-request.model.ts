import {model, Model, property} from '@loopback/repository';
import {Pageable} from '../../models/pagination/pagination.model';

@model()
export abstract class PagedRequest<T> extends Model implements Pageable {
  @property({
    type: 'number',
    required: false,
    jsonSchema: {
      type: 'integer',
      format: 'int32',
    },
  })
  size?: number;

  @property({
    type: 'number',
    required: false,
    jsonSchema: {
      type: 'integer',
      format: 'int32',
    },
  })
  page?: number;

  constructor(data?: Partial<PagedRequest<T>>) {
    super(data);
  }
}
