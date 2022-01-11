import {model, Model, property} from '@loopback/repository';

@model()
export abstract class PagedResponse<T> extends Model {
  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      type: 'integer',
      format: 'int32',
    },
  })
  numberOfElements: number;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      type: 'integer',
      format: 'int32',
    },
  })
  totalElements: number;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      type: 'integer',
      format: 'int32',
    },
  })
  totalPages: number;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      type: 'integer',
      format: 'int32',
    },
  })
  number: number;

  @property({
    type: 'number',
    required: false,
    jsonSchema: {
      type: 'integer',
      format: 'int32',
    },
  })
  size?: number;

  abstract content: T[];

  constructor(data?: Partial<PagedResponse<T>>) {
    super(data);
  }
}
