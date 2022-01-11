import {Model, model, property} from '@loopback/repository';
import {CreateUploadSessionHashesRequest} from './create-upload-session-hashes-request.model';

@model({
  name: 'CreateUploadSessionRequest',
})
export class CreateUploadSessionRequest extends Model {
  @property({
    type: 'string',
    required: true,
  })
  mimeType: string;

  @property({
    type: 'string',
    required: false,
  })
  encoding?: string;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      type: 'integer',
      format: 'int64',
    },
  })
  contentSize: number;

  @property({
    type: 'string',
    required: true,
  })
  fileName: string;

  @property({
    type: CreateUploadSessionHashesRequest,
    required: false,
  })
  hashes?: CreateUploadSessionHashesRequest;

  @property({
    required: false,
    type: 'number',
    jsonSchema: {
      type: 'integer',
      format: 'int64',
    },
  })
  version?: number;

  constructor(data?: Partial<CreateUploadSessionRequest>) {
    super(data);
  }
}
