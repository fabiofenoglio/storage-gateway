/* eslint-disable @typescript-eslint/naming-convention */
import {belongsTo, model, property} from '@loopback/repository';
import {Security} from '../../security';
import {ClientTenant} from '../client-tenant.model';
import {AuditEntity} from '../proto/audit-entity.model';

@model({
  name: 'doc_acl_client_tenant_record',
  settings: {
    foreignKeys: {
      fk_aclClientTenantRecord_nodeId: {
        name: 'fk_aclClientTenantRecord_nodeId',
        entity: 'ClientTenant',
        entityKey: 'id',
        foreignKey: 'tenantId',
      },
    },
  },
})
export class AclClientTenantRecord extends AuditEntity {
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

  constructor(data?: Partial<AclClientTenantRecord>) {
    super(data);
  }
}

export interface AclClientTenantRecordRelations {
  // describe navigational properties here
}

export type AclClientTenantRecordWithRelations = AclClientTenantRecord &
  AclClientTenantRecordRelations;
