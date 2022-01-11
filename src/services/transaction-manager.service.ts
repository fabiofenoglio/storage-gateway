import {BindingScope, inject, injectable} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {juggler} from '@loopback/repository';
import {DbDataSource} from '../datasources';
import {LoggerBindings} from '../key';

@injectable({scope: BindingScope.SINGLETON})
export class TransactionService {
  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER) private logger: WinstonLogger,
    @inject('datasources.Db') private dataSource: DbDataSource,
  ) {}

  public async inTransaction<T>(
    fn: (tx: juggler.Transaction) => Promise<T>,
    existing: juggler.Transaction | undefined = undefined,
  ) {
    return this.dataSource.inTransaction(fn, existing);
  }
}
