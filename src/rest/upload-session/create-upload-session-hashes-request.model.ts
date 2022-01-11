import {Model, model, property} from '@loopback/repository';
import {UploadedContentHashes} from '../../models/content/content-upload-dto.model';

@model({
  name: 'CreateUploadSessionHashesRequest',
})
export class CreateUploadSessionHashesRequest
  extends Model
  implements UploadedContentHashes
{
  @property({
    type: 'string',
    required: false,
  })
  md5?: string;

  @property({
    type: 'string',
    required: false,
  })
  sha1?: string;

  @property({
    type: 'string',
    required: false,
  })
  sha256?: string;

  constructor(data?: Partial<CreateUploadSessionHashesRequest>) {
    super(data);
  }
}
