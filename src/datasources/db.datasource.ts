import {inject, lifeCycleObserver, LifeCycleObserver} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {IsolationLevel, juggler} from '@loopback/repository';
import {LoggerBindings} from '../key';
import {AppCustomConfig} from '../utils';

const config = {
  name: 'Db',
  connector: 'mysql',
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
export class DbDataSource
  extends juggler.DataSource
  implements LifeCycleObserver
{
  static dataSourceName = 'Db';
  static readonly defaultConfig = config;
  configuration: AppCustomConfig;

  constructor(
    @inject(LoggerBindings.DATASOURCE_LOGGER) private logger: WinstonLogger,
    @inject('datasources.config.Db', {optional: true})
    dsConfig: object = config,
  ) {
    super(dsConfig);
    this.configuration = dsConfig as AppCustomConfig;
  }

  public async inTransaction<T>(
    fn: (tx: juggler.Transaction) => Promise<T>,
    existing: juggler.Transaction | undefined = undefined,
  ): Promise<T> {
    if (!this.configuration.enableTransactions) {
      this.logger.debug(
        'transactions are disabled. executing untransactionally',
      );
      return fn(this.mockTransaction());
    }

    if (existing) {
      this.logger.debug('[tx] attaching to existing transaction');
      try {
        const result: T = await fn(existing);
        this.logger.debug(
          '[tx] deferring commit to existing transaction handler',
        );
        this.logger.debug('[tx] detaching from existing transaction');
        return result;
      } catch (err) {
        this.logger.error(
          '[tx] error in transaction, deferring rollback to existing transaction handler',
        );
        throw err;
      }
    } else {
      const tx = await this.beginTransaction(IsolationLevel.READ_COMMITTED);
      this.logger.debug('[tx] TRANSACTION OPENED');
      try {
        const result: T = await fn(tx);
        this.logger.debug('[tx] committing transaction');
        await tx.commit();
        this.logger.debug('[tx] TRANSACTION COMMITTED');
        return result;
      } catch (err) {
        this.logger.error('[tx] error in transaction, rolling back', err);
        this.logger.debug('[tx] rolling back transaction');
        await tx.rollback();
        this.logger.debug('[tx] TRANSACTION ROLLED BACK');
        throw err;
      }
    }
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
