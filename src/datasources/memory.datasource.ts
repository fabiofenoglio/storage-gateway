import {inject, lifeCycleObserver, LifeCycleObserver} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {juggler} from '@loopback/repository';
import {LoggerBindings} from '../key';

const config = {
  name: 'Memory',
  connector: 'memory',
  url: 'none',
  host: '',
  port: 0,
  user: '',
  password: '',
  database: '',
};

// Observe application's life cycle to disconnect the datasource when
// application is stopped. This allows the application to be shut down
// gracefully. The `stop()` method is inherited from `juggler.DataSource`.
// Learn more at https://loopback.io/doc/en/lb4/Life-cycle.html
@lifeCycleObserver('datasource')
export class MemoryDataSource
  extends juggler.DataSource
  implements LifeCycleObserver
{
  static dataSourceName = 'Memory';
  static readonly defaultConfig = config;

  constructor(
    @inject(LoggerBindings.DATASOURCE_LOGGER) private logger: WinstonLogger,
  ) {
    super(config);
  }

  public async inTransaction<T>(
    fn: (tx: juggler.Transaction) => Promise<T>,
    existing: juggler.Transaction | undefined = undefined,
  ): Promise<T> {
    this.logger.debug('transactions are disabled. executing untransactionally');
    return fn(this.mockTransaction());
  }

  private mockTransaction(): juggler.Transaction {
    return {
      commit: () => {
        this.logger.debug('transactions are disabled. ignoring commit');
      },
      rollback: () => {
        this.logger.debug('transactions are disabled. ignoring rollback');
      },
    };
  }
}
