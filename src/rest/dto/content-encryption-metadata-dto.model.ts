import {model, Model, property} from '@loopback/repository';

@model()
export class ContentEncryptionMetadataDto extends Model {
  @property({
    type: 'string',
  })
  algorithm?: string;

  constructor(data?: Partial<ContentEncryptionMetadataDto>) {
    super(data);
  }
}
