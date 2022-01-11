/* eslint-disable @typescript-eslint/no-explicit-any */
import {CronJob} from '@loopback/cron';
import {WinstonLogger} from '@loopback/logging';
import {v4 as uuidv4} from 'uuid';
import {
  CronJobConfiguration,
  CronJobExecutionContext,
  CronJobReportedMessageLevel,
} from '../models/cron/cron-interface.model';
import {RestContext} from '../rest/rest-context.model';
import {CronWrapperBridgeService} from '../services/cron/cron-wrapper-bridge.service';
import {AppCustomCronConfig} from '../utils';

export abstract class CronJobWrapper extends CronJob {
  runningInstances = 0;

  constructor(
    protected cronWrapperBridgeService: CronWrapperBridgeService,
    protected jobConfig: CronJobConfiguration,
  ) {
    super({
      name: jobConfig.name,
      onTick: async () => {
        await this.onTickWrapper();
      },
      cronTime: jobConfig.schedule,
      start: false,
    });
  }

  get logPrefix(): string {
    return `[cron ${this.name}]`;
  }

  get configuration(): AppCustomCronConfig {
    return this.cronWrapperBridgeService.configuration.cron;
  }

  get logger(): WinstonLogger {
    return this.cronWrapperBridgeService.logger;
  }

  get restContext(): RestContext {
    return {
      client: 'system',
    };
  }

  public async forceExecution(): Promise<CronJobExecutionContext> {
    this.logger.info(`${this.logPrefix} forcing execution`);
    return this.runWithLock();
  }

  protected isEnabled(): boolean | Promise<boolean> {
    return this.configuration.enable;
  }

  protected abstract execute(
    ctx: CronJobExecutionContext,
  ): void | Promise<void>;

  private async onTickWrapper(): Promise<void> {
    try {
      await this.onTick();
    } catch (err) {
      this.logger.error(
        `${this.logPrefix} unhandled error in job execution wrapping`,
        err,
      );
    }
  }

  private async onTick(): Promise<CronJobExecutionContext | null> {
    if (!(await this.isEnabled())) {
      return null;
    }

    if (this.runningInstances > 0 && !this.jobConfig.allowOverlapping) {
      this.logger.warn(
        `${this.logPrefix} skipping job execution because another is still in progress and overlapping executions are not allowed`,
      );
      return null;
    }

    return this.runWithLock();
  }

  protected toLog(additionals: any): string {
    if (additionals === null || additionals === undefined) {
      return '';
    }
    try {
      return ' ' + JSON.stringify(additionals);
    } catch (e) {
      return ' ' + additionals;
    }
  }

  private async runWithLock(): Promise<CronJobExecutionContext> {
    const lockKey = 'cronjob.' + this.jobConfig.name + '.execution';
    this.logger.debug(
      `${this.logPrefix} acquiring lock ${lockKey} for execution`,
    );

    const lockAttempt = await this.cronWrapperBridgeService.lockService.acquire(
      {
        resourceCode: lockKey,
        ownerCode: uuidv4(),
        duration: 60 * 60 * 1000, // 60 minutes ????
      },
    );
    if (!lockAttempt.acquired) {
      throw new Error(
        `Could not acquire lock ${lockKey} for job execution: ${lockAttempt.reason}`,
      );
    }

    this.logger.debug(
      `${this.logPrefix} acquired lock ${lockKey} for execution as owner ${lockAttempt.lock?.ownerCode}`,
    );
    try {
      return await this.runWithWrapper();
    } finally {
      this.logger.debug(
        `${this.logPrefix} releasing acquired lock ${lockKey} after execution`,
      );
      await this.cronWrapperBridgeService.lockService.release(
        lockAttempt.lock!,
      );
    }
  }

  private async runWithWrapper(): Promise<CronJobExecutionContext> {
    this.runningInstances++;
    const ctx: CronJobExecutionContext = {
      job: this.jobConfig,
      startedAt: new Date(),
    };

    this.logger.verbose(`${this.logPrefix} starting execution`);
    const executionEntity =
      await this.cronWrapperBridgeService.createNewExecution(ctx);
    ctx.execution = executionEntity;

    try {
      await this.execute(ctx);

      ctx.finishedAt = new Date();
      this.logger.debug(`${this.logPrefix} execution completed succesfully`);
      await this.cronWrapperBridgeService.markExecutionCompleted(
        ctx,
        executionEntity,
      );
    } catch (err) {
      ctx.finishedAt = new Date();
      ctx.errored = true;

      this.logger.error(`${this.logPrefix} execution resulted in error`, err);
      await this.cronWrapperBridgeService.markExecutionFailed(
        ctx,
        executionEntity,
      );
      await this.cronWrapperBridgeService.signalExecutionError(
        err,
        executionEntity,
        ctx,
      );
    } finally {
      this.logger.verbose(`${this.logPrefix} execution completed`);
      this.runningInstances--;
      await this.cronWrapperBridgeService.signalExecutionReports(
        ctx,
        executionEntity,
      );
    }

    return ctx;
  }

  protected reportInfo(
    ctx: CronJobExecutionContext,
    message: string,
    additionals?: object,
  ): void {
    ctx.reportedMessages = ctx.reportedMessages ?? [];
    ctx.reportedMessages.push({
      level: CronJobReportedMessageLevel.INFO,
      reportedAt: new Date(),
      message: message,
      additionals,
    });

    this.logger.info(`${this.logPrefix} ${message}${this.toLog(additionals)}`);
  }

  protected reportWarning(
    ctx: CronJobExecutionContext,
    message: Error | string,
    additionals?: object,
  ): void {
    ctx.reportedMessages = ctx.reportedMessages ?? [];
    const isError = !!(message as any).message;
    ctx.reportedMessages.push({
      level: CronJobReportedMessageLevel.WARNING,
      reportedAt: new Date(),
      message: isError ? (message as Error).message : (message as string),
      name: isError ? (message as Error).name : undefined,
      additionals,
    });

    this.logger.warn(
      `${
        this.logPrefix
      } a warning was reported from execution: ${message}${this.toLog(
        additionals,
      )}`,
    );
  }

  protected reportError(
    ctx: CronJobExecutionContext,
    message: string,
    err?: Error,
    additionals?: object,
  ): void {
    ctx.reportedMessages = ctx.reportedMessages ?? [];
    const isError = !!(err as any).message;
    ctx.reportedMessages.push({
      level: CronJobReportedMessageLevel.ERROR,
      reportedAt: new Date(),
      name: message + (isError ? ' - ' + (err as Error).name : ''),
      message: isError ? (err as Error).message : message,
      additionals,
    });

    if (isError) {
      this.logger.error(
        `${
          this.logPrefix
        } an error was reported from execution: ${message}${this.toLog(
          additionals,
        )}`,
        err,
      );
    } else {
      this.logger.error(
        `${
          this.logPrefix
        } an error was reported from execution: ${message}${this.toLog(
          additionals,
        )}`,
      );
    }
  }

  protected async sleep(duration: number): Promise<void> {
    if (duration <= 0) {
      return;
    }
    return new Promise(resolve => setTimeout(resolve, duration));
  }
}
