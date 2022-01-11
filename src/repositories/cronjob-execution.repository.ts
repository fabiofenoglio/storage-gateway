import {Getter, inject} from '@loopback/core';
import {BelongsToAccessor, repository} from '@loopback/repository';
import {DbDataSource} from '../datasources';
import {Cronjob, CronjobExecution, CronjobExecutionRelations} from '../models';
import {CronjobRepository} from './cronjob.repository';
import {PaginationRepository} from './proto';

export class CronjobExecutionRepository extends PaginationRepository<
  CronjobExecution,
  typeof CronjobExecution.prototype.id,
  CronjobExecutionRelations
> {
  public readonly job: BelongsToAccessor<
    Cronjob,
    typeof CronjobExecution.prototype.id
  >;

  constructor(
    @inject('datasources.Db') dataSource: DbDataSource,
    @repository.getter('CronjobRepository')
    protected cronjobRepositoryGetter: Getter<CronjobRepository>,
  ) {
    super(CronjobExecution, dataSource);
    this.job = this.createBelongsToAccessorFor('job', cronjobRepositoryGetter);
  }
}
