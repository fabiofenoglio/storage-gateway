import {inject} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {juggler, repository} from '@loopback/repository';
import {ConfigurationBindings, LoggerBindings} from '../../key';
import {
  Cronjob,
  CronjobExecution,
  CronJobExecutionContext,
  CronjobExecutionMessage,
  CronjobExecutionStatus,
  CronJobReportedMessage,
} from '../../models';
import {
  CronjobExecutionMessageRepository,
  CronjobExecutionRepository,
  CronjobRepository,
} from '../../repositories';
import {ObjectUtils} from '../../utils';
import {AppCustomConfig} from '../../utils/configuration-utils';

export class CronLogManagerService {
  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER) public logger: WinstonLogger,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    public configuration: AppCustomConfig,
    @repository(CronjobRepository)
    private cronjobRepository: CronjobRepository,
    @repository(CronjobExecutionRepository)
    private cronjobExecutionRepository: CronjobExecutionRepository,
    @repository(CronjobExecutionMessageRepository)
    private cronjobExecutionMessageRepository: CronjobExecutionMessageRepository,
  ) {}

  public async logMessage(
    executionId: number,
    msg: CronJobReportedMessage,
  ): Promise<CronjobExecutionMessage> {
    return this.cronjobExecutionMessageRepository.create({
      executionId,
      level: msg.level,
      message: msg.message,
      name: msg.name,
      reportedAt: msg.reportedAt,
      additionals: msg.additionals,
    });
  }

  public async createNewExecution(
    ctx: CronJobExecutionContext,
  ): Promise<CronjobExecution> {
    const job = await this.getOrCreateCronjobEntity(ctx.job.name);

    const entity = await this.cronjobExecutionRepository.create({
      jobId: job.id,
      startedAt: ctx.startedAt,
      status: CronjobExecutionStatus.RUNNING,
    });

    this.logger.debug(
      `created new cronjob execution instance with id ${entity.id} in status ${entity.status}`,
    );
    return entity;
  }

  public async markExecutionCompleted(
    ctx: CronJobExecutionContext,
    entity: CronjobExecution,
  ): Promise<CronjobExecution> {
    entity.status = CronjobExecutionStatus.FINISHED;
    entity.finishedAt = ctx.finishedAt ?? new Date();
    await this.cronjobExecutionRepository.update(entity);

    this.logger.debug(
      `updated cronjob execution instance with id ${entity.id} to status ${entity.status}`,
    );
    return entity;
  }

  public async markExecutionFailed(
    ctx: CronJobExecutionContext,
    entity: CronjobExecution,
  ): Promise<CronjobExecution> {
    entity.status = CronjobExecutionStatus.FAILED;
    entity.finishedAt = ctx.finishedAt ?? new Date();
    await this.cronjobExecutionRepository.update(entity);

    this.logger.debug(
      `updated cronjob execution instance with id ${entity.id} to status ${entity.status}`,
    );
    return entity;
  }

  public async getOrCreateCronjobEntity(name: string): Promise<Cronjob> {
    let entity = await this.cronjobRepository.findOne({
      where: {
        name: {
          eq: name,
        },
      },
    });

    if (!entity) {
      // create
      entity = await this.cronjobRepository.create({
        name,
      });
      this.logger.info(
        `created new cronjob instance with id ${entity.id} and name ${entity.name}`,
      );
    }

    return entity;
  }

  public async deleteExecutionLogs(
    executionIds: number[],
    transaction?: juggler.Transaction,
  ): Promise<void> {
    ObjectUtils.notNull(executionIds);
    if (!executionIds?.length) {
      return;
    }

    let res = await this.cronjobExecutionMessageRepository.deleteAll(
      {
        executionId: {
          inq: executionIds,
        },
      },
      {transaction},
    );
    if (res.count > 0) {
      this.logger.info(
        `deleted ${res.count} cronjob execution message records`,
      );
    }

    res = await this.cronjobExecutionRepository.deleteAll(
      {
        id: {
          inq: executionIds,
        },
      },
      {transaction},
    );
    if (res.count > 0) {
      this.logger.info(`deleted ${res.count} cronjob execution records`);
    }
  }
}
