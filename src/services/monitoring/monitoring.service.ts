import {BindingScope, inject, injectable} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {ConfigurationBindings, LoggerBindings} from '../../key';
import {AppCustomConfig} from '../../utils';

@injectable({scope: BindingScope.SINGLETON})
export class MonitoringService {
  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER)
    private logger: WinstonLogger,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
  ) {
    // NOP
  }

  public async getStatus(): Promise<object> {
    return {
      status: 'UP',
      date: new Date(),
    };
  }
}
