import {inject} from '@loopback/core';
import {DefaultTransactionalRepository} from '@loopback/repository';
import {DbDataSource} from '../datasources';
import {MsGraphToken, MsGraphTokenRelations} from '../models';

export class MsGraphTokenRepository extends DefaultTransactionalRepository<
  MsGraphToken,
  typeof MsGraphToken.prototype.id,
  MsGraphTokenRelations
> {
  constructor(@inject('datasources.Db') dataSource: DbDataSource) {
    super(MsGraphToken, dataSource);
  }
}
