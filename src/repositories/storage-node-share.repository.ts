import {inject} from '@loopback/core';
import {v4 as uuidv4} from 'uuid';
import {DbDataSource} from '../datasources';
import {StorageNodeShare, StorageNodeShareRelations} from '../models';
import {PaginationRepository} from './proto/pagination-repository.proto';

export class StorageNodeShareRepository extends PaginationRepository<
  StorageNodeShare,
  typeof StorageNodeShare.prototype.id,
  StorageNodeShareRelations
> {
  constructor(@inject('datasources.Db') dataSource: DbDataSource) {
    super(StorageNodeShare, dataSource);
  }

  accessToken(): string {
    return 'ACT1-' + uuidv4();
  }

  new(
    data: Partial<StorageNodeShare> &
      Required<Pick<StorageNodeShare, 'nodeId' | 'type' | 'createdBy'>>,
  ) {
    return new StorageNodeShare({
      version: 1,
      engineVersion: 1,
      createdAt: new Date(),
      uuid: uuidv4(),
      accessToken: this.accessToken(),
      ...(data ?? {}),
    });
  }
}
