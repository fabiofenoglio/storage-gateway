import {Getter, inject} from '@loopback/core';
import {BelongsToAccessor, repository} from '@loopback/repository';
import {DbDataSource} from '../datasources';
import {
  UploadSession,
  UploadSessionPart,
  UploadSessionPartRelations,
} from '../models';
import {PaginationRepository} from './proto';
import {UploadSessionRepository} from './upload-session.repository';

export class UploadSessionPartRepository extends PaginationRepository<
  UploadSessionPart,
  typeof UploadSessionPart.prototype.id,
  UploadSessionPartRelations
> {
  public readonly session: BelongsToAccessor<
    UploadSession,
    typeof UploadSessionPart.prototype.id
  >;

  constructor(
    @inject('datasources.Db') dataSource: DbDataSource,
    @repository.getter('UploadSessionRepository')
    protected uploadSessionRepositoryGetter: Getter<UploadSessionRepository>,
  ) {
    super(UploadSessionPart, dataSource);
    this.session = this.createBelongsToAccessorFor(
      'session',
      uploadSessionRepositoryGetter,
    );
  }
}
