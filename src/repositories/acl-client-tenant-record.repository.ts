import {inject} from '@loopback/core';
import {DefaultTransactionalRepository} from '@loopback/repository';
import {DbDataSource} from '../datasources';
import {AclClientTenantRecord, AclClientTenantRecordRelations} from '../models';

export class AclClientTenantRecordRepository extends DefaultTransactionalRepository<
  AclClientTenantRecord,
  typeof AclClientTenantRecord.prototype.id,
  AclClientTenantRecordRelations
> {
  constructor(@inject('datasources.Db') dataSource: DbDataSource) {
    super(AclClientTenantRecord, dataSource);
  }
}
