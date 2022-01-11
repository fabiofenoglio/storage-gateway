import {service} from '@loopback/core';
import {cronJob} from '@loopback/cron';
import fs from 'fs-extra';
import {CronJobExecutionContext} from '../models';
import {CronWrapperBridgeService} from '../services/cron/cron-wrapper-bridge.service';
import {CronJobWrapper} from './wrapper.cronjob';

@cronJob()
export class UploadFolderCleanupCronJob extends CronJobWrapper {
  private IS_UPLOAD_FOLDER_REGEX = /^\d{4}\-\d{2}\-\d{2}$/;
  private TIME_TRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(
    @service(CronWrapperBridgeService)
    protected cronWrapperBridgeService: CronWrapperBridgeService,
  ) {
    // at 3:15 every day
    super(cronWrapperBridgeService, {
      name: 'UploadFolderCleanup',
      // schedule: '0 15 3 * * *',
      schedule: '0 */5 * * * *',
    });
  }

  public async execute(ctx: CronJobExecutionContext): Promise<void> {
    this.logger.debug('fetching folders in upload location');
    const treshold = new Date(new Date().getTime() - this.TIME_TRESHOLD_MS);
    const rootUploadLocation =
      this.cronWrapperBridgeService.configuration.upload.location;
    const folders = await fs.promises.readdir(rootUploadLocation);

    const toDeleteNames = folders.filter(name =>
      name.match(this.IS_UPLOAD_FOLDER_REGEX),
    );
    let toDelete = [];
    for (const toDeleteCandidate of toDeleteNames) {
      const fullPath = rootUploadLocation + '/' + toDeleteCandidate;
      const fstat = await fs.promises.stat(fullPath);
      if (!fstat.isDirectory()) {
        continue;
      }
      const dateOfDirectory = new Date(`${toDeleteCandidate}T12:00:00`);
      if (dateOfDirectory.getTime() >= treshold.getTime()) {
        continue;
      }

      toDelete.push(fullPath);
    }

    if (!toDelete.length) {
      return;
    }

    this.logger.debug(`deleting ${toDelete.length} upload folders`);

    // order by date desc
    toDelete = toDelete.sort();
    let numDeleted = 0;

    for (const singleFolderToDelete of toDelete) {
      this.logger.debug(`deleting upload folder ${singleFolderToDelete}`);
      try {
        await fs.remove(singleFolderToDelete);
        numDeleted++;
        this.logger.debug(`deleted upload folder ${singleFolderToDelete}`);
      } catch (err) {
        this.reportError(
          ctx,
          `error deleting upload folder ${singleFolderToDelete}`,
          err,
        );
      }
    }

    if (numDeleted) {
      this.reportInfo(ctx, `deleted ${numDeleted} old upload directories`);
    }
  }
}
