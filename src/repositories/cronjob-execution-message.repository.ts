import {Getter, inject} from '@loopback/core';
import {BelongsToAccessor, repository} from '@loopback/repository';
import {DbDataSource} from '../datasources';
import {
  CronjobExecution,
  CronjobExecutionMessage,
  CronjobExecutionMessageRelations,
} from '../models';
import {CronjobExecutionRepository} from './cronjob-execution.repository';
import {PaginationRepository} from './proto';

export class CronjobExecutionMessageRepository extends PaginationRepository<
  CronjobExecutionMessage,
  typeof CronjobExecutionMessage.prototype.id,
  CronjobExecutionMessageRelations
> {
  public readonly execution: BelongsToAccessor<
    CronjobExecution,
    typeof CronjobExecutionMessage.prototype.id
  >;

  constructor(
    @inject('datasources.Db') dataSource: DbDataSource,
    @repository.getter('CronjobExecutionRepository')
    protected cronjobExecutionRepositoryGetter: Getter<CronjobExecutionRepository>,
  ) {
    super(CronjobExecutionMessage, dataSource);
    this.execution = this.createBelongsToAccessorFor(
      'execution',
      cronjobExecutionRepositoryGetter,
    );
  }
}
