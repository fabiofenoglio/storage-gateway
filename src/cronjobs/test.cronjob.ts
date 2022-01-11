import {service} from '@loopback/core';
import {cronJob} from '@loopback/cron';
import {CronJobExecutionContext} from '../models';
import {CronWrapperBridgeService} from '../services/cron/cron-wrapper-bridge.service';
import {CronJobWrapper} from './wrapper.cronjob';

@cronJob()
export class TestCronJob extends CronJobWrapper {
  constructor(
    @service(CronWrapperBridgeService)
    protected cronWrapperBridgeService: CronWrapperBridgeService,
  ) {
    super(cronWrapperBridgeService, {
      name: 'TestJob1',
      schedule: '0/30 * * * * *',
    });
  }

  public async execute(ctx: CronJobExecutionContext): Promise<void> {
    // throw new Error('Method not implemented.');
    console.log('job doing things!!!');
    await this.sleep(10000);
  }
}
