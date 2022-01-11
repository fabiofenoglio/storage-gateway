import {BindingScope, inject, injectable, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {TestCronJob} from '../../cronjobs/test.cronjob';
import {ConfigurationBindings, LoggerBindings} from '../../key';
import {AppCustomConfig} from '../../utils/configuration-utils';

@injectable({
  scope: BindingScope.SINGLETON,
})
export class CronLauncherService {
  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER) public logger: WinstonLogger,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    public configuration: AppCustomConfig,
    @service(TestCronJob)
    private testCronJob: TestCronJob,
  ) {}

  public async launchTestJob(): Promise<object> {
    this.logger.info('running testCronJob manually');
    const result = await this.testCronJob.forceExecution();
    this.logger.info('finished running testCronJob manually');

    return {
      ...result,
    };
  }
}
