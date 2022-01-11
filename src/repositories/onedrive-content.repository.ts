import {inject} from '@loopback/core';
import {DbDataSource} from '../datasources';
import {OnedriveContent, OnedriveContentRelations} from '../models';
import {PaginationRepository} from './proto/pagination-repository.proto';

export class OnedriveContentRepository extends PaginationRepository<
  OnedriveContent,
  typeof OnedriveContent.prototype.id,
  OnedriveContentRelations
> {
  constructor(@inject('datasources.Db') dataSource: DbDataSource) {
    super(OnedriveContent, dataSource);
  }
}
