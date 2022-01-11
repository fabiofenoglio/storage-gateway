/* eslint-disable @typescript-eslint/naming-convention */
import {belongsTo, model, property} from '@loopback/repository';
import {AuditEntity} from './proto/audit-entity.model';
import {StorageNode} from './storage-node.model';

@model({
  name: 'doc_storage_node_share',
  settings: {
    foreignKeys: {
      fk_storageNodeShare_nodeId: {
        name: 'fk_storageNodeShare_nodeId',
        entity: 'StorageNode',
        entityKey: 'id',
        foreignKey: 'nodeId',
      },
    },
  },
})
export class StorageNodeShare extends AuditEntity {
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
    required: true,
    defaultFn: 'uuidv4',
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  accessToken: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
      columnName: 'type',
    },
  })
  type: string;

  @property({
    type: 'number',
    required: true,
  })
  engineVersion: number;

  @belongsTo(
    () => StorageNode,
    {},
    {
      mysql: {
        dataType: 'int',
      },
    },
  )
  nodeId: number;

  constructor(data?: Partial<StorageNodeShare>) {
    super(data);
  }
}

export interface StorageNodeShareRelations {
  // describe navigational properties here
}

export type StorageNodeShareWithRelations = StorageNodeShare &
  StorageNodeShareRelations;

export enum StorageNodeShareType {
  EMBED = 'EMBED',
}
