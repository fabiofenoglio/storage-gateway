import {inject} from '@loopback/core';
import {DefaultTransactionalRepository} from '@loopback/repository';
import {DbDataSource} from '../datasources';
import {
  FilesystemBackboneTenant,
  FilesystemBackboneTenantRelations,
} from '../models';

export class FilesystemBackboneTenantRepository extends DefaultTransactionalRepository<
  FilesystemBackboneTenant,
  typeof FilesystemBackboneTenant.prototype.id,
  FilesystemBackboneTenantRelations
> {
  constructor(@inject('datasources.Db') dataSource: DbDataSource) {
    super(FilesystemBackboneTenant, dataSource);
  }
}
