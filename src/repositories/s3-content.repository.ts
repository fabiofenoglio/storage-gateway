import {inject} from '@loopback/core';
import {DbDataSource} from '../datasources';
import {S3Content, S3ContentRelations} from '../models';
import {PaginationRepository} from './proto';

export class S3ContentRepository extends PaginationRepository<
  S3Content,
  typeof S3Content.prototype.id,
  S3ContentRelations
> {
  constructor(@inject('datasources.Db') dataSource: DbDataSource) {
    super(S3Content, dataSource);
  }
}
