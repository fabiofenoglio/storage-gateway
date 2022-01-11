/* eslint-disable @typescript-eslint/no-explicit-any */
import {service} from '@loopback/core';
import {cronJob} from '@loopback/cron';
import {repository} from '@loopback/repository';
import {CronJobExecutionContext, CronjobExecutionStatus} from '../models';
import {CronjobExecutionRepository} from '../repositories';
import {CronLogManagerService} from '../services/cron/cron-log-manager.service';
import {CronWrapperBridgeService} from '../services/cron/cron-wrapper-bridge.service';
import {CronJobWrapper} from './wrapper.cronjob';

@cronJob()
export class LogsCleanupCronJob extends CronJobWrapper {
  constructor(
    @service(CronWrapperBridgeService)
    protected cronWrapperBridgeService: CronWrapperBridgeService,
    @service(CronLogManagerService)
    protected cronLogManagerService: CronLogManagerService,
    @repository(CronjobExecutionRepository)
    protected cronjobExecutionRepository: CronjobExecutionRepository,
  ) {
    // at 3:30 of every day
    super(cronWrapperBridgeService, {
      name: 'LogsCleanup',
      schedule: '00 30 3 * * *',
      // schedule: '0/30 * * * * *',
    });
  }

  public async execute(ctx: CronJobExecutionContext): Promise<void> {
    // find older than 3 days
    const tresholdDate = new Date(
      new Date().getTime() - 3 * 24 * 60 * 60 * 1000,
    );
    const obsoleteExecutions = await this.cronjobExecutionRepository.findPage(
      {
        where: {
          status: CronjobExecutionStatus.FINISHED,
          finishedAt: {
            neq: null,
            lte: tresholdDate,
          } as any,
        },
        order: ['id'],
      },
      {page: 0, size: 100},
    );

    if (!obsoleteExecutions.hasContent) {
      this.logger.debug(`found no obsolete execution logs to remove`);
      return;
    }

    this.logger.info(
      `found ${obsoleteExecutions.numberOfElements} obsolete execution logs to remove`,
    );

    await this.cronLogManagerService.deleteExecutionLogs(
      obsoleteExecutions.content.map(e => e.id!),
    );

    this.reportInfo(
      ctx,
      `deleted ${obsoleteExecutions.numberOfElements} obsolete execution logs`,
    );
  }
}
