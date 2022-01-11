import {inject} from '@loopback/core';
import {PaginationRepository} from '.';
import {MemoryDataSource} from '../datasources/memory.datasource';
import {MemoryContent} from '../models';

export class InMemoryContentRepository extends PaginationRepository<
  MemoryContent,
  typeof MemoryContent.prototype.id,
  {}
> {
  constructor(@inject('datasources.Memory') dataSource: MemoryDataSource) {
    super(MemoryContent, dataSource);
  }
}
