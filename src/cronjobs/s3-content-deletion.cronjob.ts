import {service} from '@loopback/core';
import {cronJob} from '@loopback/cron';
import {CronJobExecutionContext, S3Content} from '../models';
import {S3ContentManager} from '../services';
import {CronWrapperBridgeService} from '../services/cron/cron-wrapper-bridge.service';
import {CronJobWrapper} from './wrapper.cronjob';

@cronJob()
export class S3ContentDeletionCronJob extends CronJobWrapper {
  constructor(
    @service(CronWrapperBridgeService)
    protected cronWrapperBridgeService: CronWrapperBridgeService,
    @service(S3ContentManager)
    protected contentManager: S3ContentManager,
  ) {
    // every 15 minutes
    super(cronWrapperBridgeService, {
      name: 'S3ContentDeletion',
      schedule: '0 */15 * * * *',
    });
  }

  public async execute(ctx: CronJobExecutionContext): Promise<void> {
    const toDelete = await this.contentManager.getContentQueuedForDeletion({
      page: 0,
      size: 50,
    });

    if (!toDelete.hasContent) {
      this.logger.debug(`${this.logPrefix} found no contents to remove`);
      return;
    }

    this.logger.info(
      `${this.logPrefix} found ${toDelete.totalElements} contents to be removed, processing ${toDelete.numberOfElements}`,
    );

    let removedCounter = 0;
    for (const record of toDelete.content) {
      const res = await this.attemptDeletion(ctx, record);
      if (res) {
        removedCounter++;
      }
    }

    if (removedCounter) {
      this.reportInfo(ctx, `deleted ${removedCounter} physical contents`);
    }
  }

  private async attemptDeletion(
    ctx: CronJobExecutionContext,
    entity: S3Content,
  ): Promise<boolean> {
    try {
      await this.contentManager.deletePhysicalContent(entity, this.restContext);
      return true;
    } catch (err) {
      this.reportError(
        ctx,
        `error removing physical content ${entity.id}:${entity.key} - ${entity.uuid} from ${entity.remoteId}`,
        err,
        {
          entityId: entity.id,
        },
      );
      return false;
    }
  }
}
