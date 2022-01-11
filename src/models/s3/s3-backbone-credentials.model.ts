import {Model, model, property} from '@loopback/repository';

@model()
export class S3BackboneCredentials extends Model {
  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 1024,
    },
  })
  accessKeyId: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 1024,
    },
  })
  secretAccessKey: string;

  constructor(data?: Partial<S3BackboneCredentials>) {
    super(data);
  }
}
