import {inject} from '@loopback/core';
import {DbDataSource} from '../datasources';
import {ResourceLock, ResourceLockRelations} from '../models';
import {PaginationRepository} from './proto/pagination-repository.proto';

export class ResourceLockRepository extends PaginationRepository<
  ResourceLock,
  typeof ResourceLock.prototype.id,
  ResourceLockRelations
> {
  constructor(@inject('datasources.Db') dataSource: DbDataSource) {
    super(ResourceLock, dataSource);
  }
}
