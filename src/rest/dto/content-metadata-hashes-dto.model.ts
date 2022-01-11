import {model, Model, property} from '@loopback/repository';

@model()
export class ContentMetadataHashesDto extends Model {
  @property({
    type: 'string',
  })
  md5?: string;

  @property({
    type: 'string',
  })
  sha1?: string;

  @property({
    type: 'string',
  })
  sha256?: string;

  constructor(data?: Partial<ContentMetadataHashesDto>) {
    super(data);
  }
}
