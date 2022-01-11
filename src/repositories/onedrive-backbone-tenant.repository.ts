import {inject} from '@loopback/core';
import {DefaultTransactionalRepository} from '@loopback/repository';
import {DbDataSource} from '../datasources';
import {
  OnedriveBackboneTenant,
  OnedriveBackboneTenantRelations,
} from '../models';

export class OnedriveBackboneTenantRepository extends DefaultTransactionalRepository<
  OnedriveBackboneTenant,
  typeof OnedriveBackboneTenant.prototype.id,
  OnedriveBackboneTenantRelations
> {
  constructor(@inject('datasources.Db') dataSource: DbDataSource) {
    super(OnedriveBackboneTenant, dataSource);
  }
}
