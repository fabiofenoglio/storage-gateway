import {inject} from '@loopback/core';
import {DbDataSource} from '../datasources';
import {Cronjob, CronjobRelations} from '../models';
import {PaginationRepository} from './proto/pagination-repository.proto';

export class CronjobRepository extends PaginationRepository<
  Cronjob,
  typeof Cronjob.prototype.id,
  CronjobRelations
> {
  constructor(@inject('datasources.Db') dataSource: DbDataSource) {
    super(Cronjob, dataSource);
  }
}
