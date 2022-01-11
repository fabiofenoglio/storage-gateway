/* eslint-disable @typescript-eslint/naming-convention */
import {belongsTo, model, property} from '@loopback/repository';
import {Security} from '../../security';
import {ClientTenant} from '../client-tenant.model';
import {AuditEntity} from '../proto/audit-entity.model';
import {StorageNode} from '../storage-node.model';

@model({
  name: 'doc_acl_storage_node_record',
  settings: {
    foreignKeys: {
      fk_aclStorageNodeRecord_nodeId: {
        name: 'fk_aclStorageNodeRecord_nodeId',
        entity: 'StorageNode',
        entityKey: 'id',
        foreignKey: 'nodeId',
      },
      fk_aclStorageNodeRecord_tenantId: {
        name: 'fk_aclStorageNodeRecord_tenantId',
        entity: 'ClientTenant',
        entityKey: 'id',
        foreignKey: 'tenantId',
      },
    },
  },
})
export class AclStorageNodeRecord extends AuditEntity {
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
  clientIdentifier: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
    jsonSchema: {
      enum: Object.values(Security.Permissions),
    },
  })
  policy: string;

  @property({
    type: 'boolean',
    required: true,
  })
  recursive: boolean;

  @property({
    type: 'number',
    required: true,
  })
  engineVersion: number;

  @belongsTo(
    () => ClientTenant,
    {},
    {
      mysql: {
        dataType: 'int',
      },
    },
  )
  tenantId: number;

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

  constructor(data?: Partial<AclStorageNodeRecord>) {
    super(data);
  }
}

export interface AclStorageNodeRecordRelations {
  // describe navigational properties here
}

export type AclStorageNodeRecordWithRelations = AclStorageNodeRecord &
  AclStorageNodeRecordRelations;
