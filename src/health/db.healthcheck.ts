import {inject, Provider} from '@loopback/core';
import {ReadyCheck} from '@loopback/health';
import {WinstonLogger} from '@loopback/logging';
import {DbDataSource} from '../datasources';
import {LoggerBindings} from '../key';

export class DBHealthCheckProvider implements Provider<ReadyCheck> {
  constructor(
    @inject(LoggerBindings.ROOT_LOGGER) private logger: WinstonLogger,
    @inject('datasources.Db') private dataSource: DbDataSource,
  ) {
    // NOP
  }

  value() {
    return () => {
      this.logger.debug('checking db health status');
      return this.dataSource.ping();
    };
  }
}
