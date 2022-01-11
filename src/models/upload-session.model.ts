import {belongsTo, Entity, model, property} from '@loopback/repository';
import {StorageNode} from './storage-node.model';

export enum UploadSessionStatus {
  ACTIVE = 'ACTIVE',
  FINALIZING = 'FINALIZING',
  FINALIZED = 'FINALIZED',
  DELETED = 'DELETED',
  CLEARED = 'CLEARED',
}

@model({
  name: 'doc_upload_session',
  settings: {},
})
export class UploadSession extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id?: number;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 100,
    },
  })
  uuid: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 100,
    },
    jsonSchema: {
      enum: Object.values(UploadSessionStatus),
    },
  })
  status: string;

  @property({
    type: 'date',
    required: true,
  })
  createdAt: Date;

  @property({
    type: 'date',
    required: false,
  })
  transitionedAt?: Date;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  createdBy: string;

  @property({
    type: 'date',
    required: true,
  })
  expiresAt: Date;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  mimeType: string;

  @property({
    type: 'string',
    required: false,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  encoding?: string;

  @property({
    type: 'number',
    required: true,
  })
  contentSize: number;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 1024,
    },
  })
  originalName: string;

  @property({
    type: 'string',
    required: false,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  md5?: string;

  @property({
    type: 'string',
    required: false,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  sha1?: string;

  @property({
    type: 'string',
    required: false,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  sha256?: string;

  @property({
    required: false,
    type: 'number',
  })
  version?: number;

  @property({
    type: 'string',
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  nodeUuid?: string;

  @belongsTo(
    () => StorageNode,
    {},
    {
      mysql: {
        dataType: 'int',
      },
    },
  )
  nodeId?: number | null;

  constructor(data?: Partial<UploadSession>) {
    super(data);
  }
}

export interface UploadSessionRelations {
  // describe navigational properties here
}

export type UploadSessionWithRelations = UploadSession & UploadSessionRelations;
