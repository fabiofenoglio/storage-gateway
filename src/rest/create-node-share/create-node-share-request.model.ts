import {Model, model, property} from '@loopback/repository';

@model()
export class CreateNodeShareRequest extends Model {
  @property({
    type: 'string',
    required: true,
  })
  type: string;

  constructor(data?: Partial<CreateNodeShareRequest>) {
    super(data);
  }
}
