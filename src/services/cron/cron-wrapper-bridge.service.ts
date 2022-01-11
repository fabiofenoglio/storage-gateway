/* eslint-disable @typescript-eslint/no-explicit-any */
import {inject, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {ConfigurationBindings, ErrorBindings, LoggerBindings} from '../../key';
import {
  CronjobExecution,
  CronJobExecutionContext,
  CronJobReportedMessage,
  CronJobReportedMessageLevel,
} from '../../models';
import {ObjectUtils} from '../../utils';
import {AppCustomConfig} from '../../utils/configuration-utils';
import {ErrorService} from '../error.service';
import {LockService} from '../lock.service';
import {CronLogManagerService} from './cron-log-manager.service';

export class CronWrapperBridgeService {
  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER) public logger: WinstonLogger,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    public configuration: AppCustomConfig,
    @service(CronLogManagerService)
    private cronLogManagerService: CronLogManagerService,
    @service(LockService)
    public lockService: LockService,
    @inject(ErrorBindings.ERROR_SERVICE) private errorService: ErrorService,
  ) {}

  public async signalExecutionError(
    err: Error,
    executionEntity: CronjobExecution,
    ctx: CronJobExecutionContext,
  ): Promise<void> {
    const now = new Date();
    this.logger.info('reporting job execution error');
    const additionals = {
      errorMessage: err.message,
      errorName: err.name,
      startedAt: ctx.startedAt,
      finishedAt: ctx.finishedAt,
    };

    // LOG ON DB
    if (executionEntity.id) {
      try {
        await this.cronLogManagerService.logMessage(executionEntity.id, {
          level: CronJobReportedMessageLevel.ERROR,
          message: err.message,
          name: err.name,
          reportedAt: now,
          additionals,
        });
      } catch (errLogging) {
        this.logger.error(
          'an error occured logging on db the job execution error',
          errLogging,
        );
      }
    }

    // report to error service
    try {
      await this.errorService.reportError(
        `execution #${ctx.execution?.id} of job ${ctx.job.name} resulted in error: ` +
          err.message,
        additionals,
      );
      this.logger.info('job execution error reported succesfully');
    } catch (errSignaling) {
      this.logger.error(
        'an error occured reporting the job execution error',
        errSignaling,
      );
    }
  }

  public async signalExecutionReports(
    ctx: CronJobExecutionContext,
    executionEntity: CronjobExecution,
  ): Promise<void> {
    // NOSONAR
    if (!ctx.reportedMessages?.length) {
      return;
    }

    for (const msg of ctx.reportedMessages) {
      // LOG ON DB
      try {
        await this.cronLogManagerService.logMessage(executionEntity.id!, msg);
      } catch (errLogging) {
        this.logger.error(
          'an error occured logging on db the job execution report message',
          errLogging,
        );
      }
    }

    const grouped = ObjectUtils.indexByString(
      ctx.reportedMessages,
      m => m.level,
    );
    if (grouped[CronJobReportedMessageLevel.ERROR]) {
      await this.groupReport(ctx, grouped[CronJobReportedMessageLevel.ERROR]);
    }
    if (grouped[CronJobReportedMessageLevel.WARNING]) {
      await this.groupReport(ctx, grouped[CronJobReportedMessageLevel.WARNING]);
    }
  }

  private async groupReport(
    ctx: CronJobExecutionContext,
    messages: CronJobReportedMessage[],
  ): Promise<void> {
    const firstMessage = messages[0];
    this.logger.info(`reporting job execution ${firstMessage.level} messages`);
    try {
      const mergedAdditionals: any = {};
      let counter = 0;
      for (const msg of messages) {
        mergedAdditionals[`msg${counter}_name`] = msg.name;
        mergedAdditionals[`msg${counter}_message`] = msg.message;
        mergedAdditionals[`msg${counter}_timestamp`] =
          msg.reportedAt.toISOString();
        for (const k of Object.keys(msg.additionals ?? {})) {
          mergedAdditionals[`msg${counter}_${k}`] = (msg.additionals as any)[k];
        }
        counter++;
      }

      const reportMsg = `Execution #${ctx.execution?.id} of job ${ctx.job.name} reported ${messages.length} ${firstMessage.level} messages`;

      if (firstMessage.level === CronJobReportedMessageLevel.ERROR) {
        await this.errorService.reportError(reportMsg, mergedAdditionals);
      } else if (firstMessage.level === CronJobReportedMessageLevel.WARNING) {
        await this.errorService.reportWarning(reportMsg, mergedAdditionals);
      } else {
        await this.errorService.reportInfo(reportMsg, mergedAdditionals);
      }

      this.logger.info(
        `job execution ${firstMessage.level} messages reported succesfully`,
      );
    } catch (errSignaling) {
      this.logger.error(
        `an error occured reporting the job execution ${firstMessage.level} messages`,
        errSignaling,
      );
    }
  }

  public async createNewExecution(
    ctx: CronJobExecutionContext,
  ): Promise<CronjobExecution> {
    return this.cronLogManagerService.createNewExecution(ctx);
  }

  public async markExecutionCompleted(
    ctx: CronJobExecutionContext,
    entity: CronjobExecution,
  ): Promise<CronjobExecution> {
    return this.cronLogManagerService.markExecutionCompleted(ctx, entity);
  }

  public async markExecutionFailed(
    ctx: CronJobExecutionContext,
    entity: CronjobExecution,
  ): Promise<CronjobExecution> {
    return this.cronLogManagerService.markExecutionFailed(ctx, entity);
  }
}
