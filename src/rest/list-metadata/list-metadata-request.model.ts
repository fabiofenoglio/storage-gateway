import {Model, model, property} from '@loopback/repository';
import {StringFilter} from '../filter';

@model()
export class ListMetadataRequest extends Model {
  @property({
    type: StringFilter,
  })
  key?: StringFilter;

  constructor(data?: Partial<ListMetadataRequest>) {
    super(data);
  }
}
