import {Model, model, property} from '@loopback/repository';

@model({
  name: 'CreateUploadSessionResponse',
})
export class CreateUploadSessionResponse extends Model {
  @property({
    type: 'string',
    required: true,
  })
  uuid: string;

  constructor(data?: Partial<CreateUploadSessionResponse>) {
    super(data);
  }
}
