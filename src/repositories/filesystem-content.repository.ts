import {inject} from '@loopback/core';
import {DbDataSource} from '../datasources';
import {FilesystemContent, FilesystemContentRelations} from '../models';
import {PaginationRepository} from './proto/pagination-repository.proto';

export class FilesystemContentRepository extends PaginationRepository<
  FilesystemContent,
  typeof FilesystemContent.prototype.id,
  FilesystemContentRelations
> {
  constructor(@inject('datasources.Db') dataSource: DbDataSource) {
    super(FilesystemContent, dataSource);
  }
}
