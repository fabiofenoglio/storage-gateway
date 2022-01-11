import {Model, model, property} from '@loopback/repository';

@model()
export abstract class BaseFilter<T> extends Model {
  @property({
    type: 'boolean',
  })
  specified?: boolean;

  abstract equals?: T;

  abstract notEquals?: T;

  abstract in?: T[];

  abstract notIn?: T[];

  constructor(data?: Partial<BaseFilter<T>>) {
    super(data);
  }
}
