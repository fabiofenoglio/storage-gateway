import {service} from '@loopback/core';
import {cronJob} from '@loopback/cron';
import {CronJobExecutionContext} from '../models';
import {CronWrapperBridgeService} from '../services/cron/cron-wrapper-bridge.service';
import {MultipartUploadService} from '../services/multipart-upload.service';
import {CronJobWrapper} from './wrapper.cronjob';

@cronJob()
export class UploadSessionsCleanupCronJob extends CronJobWrapper {
  constructor(
    @service(CronWrapperBridgeService)
    protected cronWrapperBridgeService: CronWrapperBridgeService,
    @service(MultipartUploadService)
    protected multipartUploadService: MultipartUploadService,
  ) {
    // every 15 minutes
    super(cronWrapperBridgeService, {
      name: 'UploadSessionsCleanup',
      schedule: '0 */15 * * * *',
    });
  }

  public async execute(ctx: CronJobExecutionContext): Promise<void> {
    this.logger.debug('fetching deletion candidates');
    const candidates = await this.multipartUploadService.getPurgeCandidates({
      page: 0,
      size: 50,
    });
    if (candidates.totalElements > 0) {
      this.logger.debug(
        `found in total ${candidates.totalElements} expired or obsolete sessions to purge, processing ${candidates.numberOfElements} now`,
      );
    }

    for (const candidate of candidates.content) {
      this.logger.verbose(
        `deleting expired or obsolete session ${candidate.id}/${candidate.uuid}`,
      );

      try {
        await this.multipartUploadService.purgeExpiredSession(candidate);
        this.reportInfo(
          ctx,
          `purged old upload session ${candidate.id}/${candidate.uuid}`,
        );
      } catch (err) {
        this.reportError(
          ctx,
          `error purging old upload session ${candidate.id}/${candidate.uuid}`,
          err,
          {
            sessionId: candidate.id,
          },
        );
      }
    }

    this.logger.debug('purging cleared records from days ago from database');
    await this.multipartUploadService.purgeClearedRecords();
  }
}
