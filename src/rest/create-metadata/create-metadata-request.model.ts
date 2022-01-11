/* eslint-disable @typescript-eslint/no-explicit-any */
import {Model, model, property} from '@loopback/repository';

@model()
export class CreateMetadataRequest extends Model {
  @property({
    type: 'string',
    required: true,
  })
  key: string;

  @property({
    type: 'any',
  })
  value: any;

  constructor(data?: Partial<CreateMetadataRequest>) {
    super(data);
  }
}
