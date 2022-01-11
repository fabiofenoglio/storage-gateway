import {Model, model, property} from '@loopback/repository';
import {CreateMetadataRequest} from '../create-metadata/create-metadata-request.model';

@model()
export class CreateNodeRequest extends Model {
  @property({
    type: 'string',
    required: true,
  })
  type: string;

  @property({
    type: 'string',
    required: true,
  })
  name: string;

  @property({
    type: 'array',
    itemType: CreateMetadataRequest,
  })
  metadata?: CreateMetadataRequest[];

  constructor(data?: Partial<CreateNodeRequest>) {
    super(data);
  }
}
