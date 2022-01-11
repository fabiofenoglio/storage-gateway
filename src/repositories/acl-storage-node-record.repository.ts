import {inject} from '@loopback/core';
import {DefaultTransactionalRepository} from '@loopback/repository';
import {DbDataSource} from '../datasources';
import {AclStorageNodeRecord, AclStorageNodeRecordRelations} from '../models';

export class AclStorageNodeRecordRepository extends DefaultTransactionalRepository<
  AclStorageNodeRecord,
  typeof AclStorageNodeRecord.prototype.id,
  AclStorageNodeRecordRelations
> {
  constructor(@inject('datasources.Db') dataSource: DbDataSource) {
    super(AclStorageNodeRecord, dataSource);
  }
}
