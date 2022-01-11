/* eslint-disable @typescript-eslint/no-explicit-any */
import {property} from '@loopback/repository';
import {AbstractContent} from '../content';

export abstract class ProtoS3Content extends AbstractContent {
  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 1024,
    },
  })
  remoteId: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 1024,
    },
  })
  remoteETag: string;

  @property({
    type: 'any',
    required: true,
    mysql: {
      dataType: 'text',
    },
  })
  remoteItem: any;

  constructor(data?: Partial<ProtoS3Content>) {
    super(data);
  }
}

export interface ProtoS3ContentRelations {
  // describe navigational properties here
}

export type ProtoS3ContentWithRelations = ProtoS3Content &
  ProtoS3ContentRelations;
