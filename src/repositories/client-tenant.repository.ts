import {inject} from '@loopback/core';
import {DbDataSource} from '../datasources';
import {ClientTenant, ClientTenantRelations} from '../models';
import {PaginationRepository} from './proto';

export class ClientTenantRepository extends PaginationRepository<
  ClientTenant,
  typeof ClientTenant.prototype.id,
  ClientTenantRelations
> {
  constructor(@inject('datasources.Db') dataSource: DbDataSource) {
    super(ClientTenant, dataSource);
  }
}
