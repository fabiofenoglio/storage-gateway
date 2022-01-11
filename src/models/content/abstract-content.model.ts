import {belongsTo, property} from '@loopback/repository';
import {AuditEntity} from '../proto/audit-entity.model';
import {StorageNode} from '../storage-node.model';
import {ContentEncryptionMetadata} from './content-encryption-metadata.model';
import {ContentMetadata} from './content-metadata.model';

export enum ContentStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  DELETED = 'DELETED',
}

export abstract class AbstractContent extends AuditEntity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id?: number;

  @property({
    type: 'string',
    required: true,
    defaultFn: 'uuidv4',
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  uuid: string;

  @property({
    type: 'string',
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  nodeUuid?: string;

  @property({
    type: 'number',
    required: true,
  })
  engineVersion: number;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  key: string;

  @property({
    type: 'string',
    mysql: {
      dataType: 'varchar',
      dataLength: 1024,
    },
  })
  mimeType?: string;

  @property({
    type: 'string',
    mysql: {
      dataType: 'varchar',
      dataLength: 1024,
    },
  })
  encoding?: string;

  @property({
    type: 'number',
  })
  contentSize?: number;

  @property({
    type: 'string',
    mysql: {
      dataType: 'varchar',
      dataLength: 1024,
    },
  })
  originalName?: string;

  @property({
    type: ContentMetadata,
  })
  metadata?: ContentMetadata;

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

  @property({
    type: 'date',
    required: false,
  })
  deletedAt?: Date;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 10,
    },
    jsonSchema: {
      enum: Object.values(ContentStatus),
    },
  })
  status: string;

  @property({
    type: 'date',
    required: false,
  })
  lastDeleteAttemptAt?: Date;

  @property({
    type: ContentEncryptionMetadata,
    required: false,
    mysql: {
      dataType: 'varchar',
      dataLength: 500,
    },
  })
  encryption?: ContentEncryptionMetadata;
}
