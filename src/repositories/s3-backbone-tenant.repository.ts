import {inject} from '@loopback/core';
import {DbDataSource} from '../datasources';
import {S3BackboneTenant, S3BackboneTenantRelations} from '../models';
import {PaginationRepository} from './proto';

export class S3BackboneTenantRepository extends PaginationRepository<
  S3BackboneTenant,
  typeof S3BackboneTenant.prototype.id,
  S3BackboneTenantRelations
> {
  constructor(@inject('datasources.Db') dataSource: DbDataSource) {
    super(S3BackboneTenant, dataSource);
  }
}
