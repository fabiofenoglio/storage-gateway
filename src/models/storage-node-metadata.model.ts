/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/naming-convention */
import {belongsTo, model, property} from '@loopback/repository';
import {AuditEntity} from './proto/audit-entity.model';
import {StorageNode} from './storage-node.model';

@model({
  name: 'doc_storage_node_metadata',
  settings: {
    foreignKeys: {
      fk_storageNodeMetadata_nodeId: {
        name: 'fk_storageNodeMetadata_nodeId',
        entity: 'StorageNode',
        entityKey: 'id',
        foreignKey: 'nodeId',
      },
    },
  },
})
export class StorageNodeMetadata extends AuditEntity {
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
      dataLength: 255,
    },
  })
  key: string;

  @property({
    type: 'any',
    required: true,
    mysql: {
      dataType: 'text',
    },
  })
  value: any;

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

  constructor(data?: Partial<StorageNodeMetadata>) {
    super(data);
  }
}

export interface StorageNodeMetadataRelations {
  // describe navigational properties here
}

export type StorageNodeMetadataWithRelations = StorageNodeMetadata &
  StorageNodeMetadataRelations;
