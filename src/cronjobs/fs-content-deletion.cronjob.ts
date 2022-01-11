import {service} from '@loopback/core';
import {cronJob} from '@loopback/cron';
import {CronJobExecutionContext, FilesystemContent} from '../models';
import {FilesystemContentManager} from '../services';
import {CronWrapperBridgeService} from '../services/cron/cron-wrapper-bridge.service';
import {CronJobWrapper} from './wrapper.cronjob';

@cronJob()
export class FilesystemContentDeletionCronJob extends CronJobWrapper {
  constructor(
    @service(CronWrapperBridgeService)
    protected cronWrapperBridgeService: CronWrapperBridgeService,
    @service(FilesystemContentManager)
    protected contentManager: FilesystemContentManager,
  ) {
    // every 15 minutes
    super(cronWrapperBridgeService, {
      name: 'FilesystemContentDeletion',
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
    entity: FilesystemContent,
  ): Promise<boolean> {
    try {
      await this.contentManager.deletePhysicalContent(entity, this.restContext);
      return true;
    } catch (err) {
      this.reportError(
        ctx,
        `error removing physical content ${entity.id}:${entity.key} - ${entity.uuid} from ${entity.storagePath}`,
        err,
        {
          entityId: entity.id,
        },
      );
      return false;
    }
  }
}
