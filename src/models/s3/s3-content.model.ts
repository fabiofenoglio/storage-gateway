/* eslint-disable @typescript-eslint/naming-convention */
import {model} from '@loopback/repository';
import {ProtoS3Content} from './proto-s3-content.model';

@model({
  name: 'doc_s3_content',
  settings: {
    foreignKeys: {
      fk_s3Content_nodeId: {
        name: 'fk_s3Content_nodeId',
        entity: 'StorageNode',
        entityKey: 'id',
        foreignKey: 'nodeId',
      },
      fk_s3Content_nodeUuid: {
        name: 'fk_s3Content_nodeUuid',
        entity: 'StorageNode',
        entityKey: 'uuid',
        foreignKey: 'nodeUuid',
      },
    },
  },
})
export class S3Content extends ProtoS3Content {
  constructor(data?: Partial<S3Content>) {
    super(data);
  }
}

export interface S3ContentRelations {
  // describe navigational properties here
}

export type S3ContentWithRelations = S3Content & S3ContentRelations;
