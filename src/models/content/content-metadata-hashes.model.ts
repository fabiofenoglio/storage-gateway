import {model, Model, property} from '@loopback/repository';
import {UploadedContentHashes} from './content-upload-dto.model';

@model()
export class ContentMetadataHashes
  extends Model
  implements UploadedContentHashes
{
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

  constructor(data?: Partial<ContentMetadataHashes>) {
    super(data);
  }
}
