/* eslint-disable @typescript-eslint/naming-convention */
import {belongsTo, hasMany, model, property} from '@loopback/repository';
import {AuditEntity} from './proto/audit-entity.model';
import {StorageNodeMetadata} from './storage-node-metadata.model';

export enum NodeStatus {
  ACTIVE = 'ACTIVE',
  DELETED = 'DELETED',
}

@model({
  name: 'doc_storage_node',
  settings: {
    foreignKeys: {
      fk_storageNode_tenantId: {
        name: 'fk_storageNode_tenantId',
        entity: 'ClientTenant',
        entityKey: 'id',
        foreignKey: 'tenantId',
      },
      fk_storageNode_parentId: {
        name: 'fk_storageNode_parentId',
        entity: 'StorageNode',
        entityKey: 'id',
        foreignKey: 'parentId',
      },
      fk_storageNode_parentUuid: {
        name: 'fk_storageNode_parentUuid',
        entity: 'StorageNode',
        entityKey: 'uuid',
        foreignKey: 'parentUuid',
      },
    },
  },
})
export class StorageNode extends AuditEntity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id?: number;

  @property({
    type: 'number',
    required: true,
  })
  tenantId: number;

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
  parentUuid?: string;

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
      columnName: 'nodeType',
    },
  })
  type: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 1024,
    },
  })
  name: string;

  @belongsTo(
    () => StorageNode,
    {},
    {
      mysql: {
        dataType: 'int',
      },
    },
  )
  parentId?: number;

  @hasMany(() => StorageNodeMetadata, {keyTo: 'nodeId'})
  metadata: StorageNodeMetadata[];

  @hasMany(() => StorageNode, {keyTo: 'parentId'})
  children: StorageNode[];

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
      enum: Object.values(NodeStatus),
    },
  })
  status: string;

  @property({
    type: 'date',
    required: false,
  })
  lastDeleteAttemptAt?: Date;

  constructor(data?: Partial<StorageNode>) {
    super(data);
  }
}

export interface StorageNodeRelations {
  // describe navigational properties here
}

export type StorageNodeWithRelations = StorageNode & StorageNodeRelations;

export enum StorageNodeType {
  FOLDER = 'FOLDER',
  FILE = 'FILE',
}
