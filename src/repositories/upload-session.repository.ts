import {inject} from '@loopback/core';
import {DbDataSource} from '../datasources';
import {UploadSession, UploadSessionRelations} from '../models';
import {PaginationRepository} from './proto';

export class UploadSessionRepository extends PaginationRepository<
  UploadSession,
  typeof UploadSession.prototype.id,
  UploadSessionRelations
> {
  constructor(@inject('datasources.Db') dataSource: DbDataSource) {
    super(UploadSession, dataSource);
  }
}
