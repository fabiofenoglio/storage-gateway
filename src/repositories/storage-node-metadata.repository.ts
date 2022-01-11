import {Getter, inject} from '@loopback/core';
import {BelongsToAccessor, repository} from '@loopback/repository';
import {DbDataSource} from '../datasources';
import {
  StorageNode,
  StorageNodeMetadata,
  StorageNodeMetadataRelations,
} from '../models';
import {PaginationRepository} from './proto';
import {StorageNodeRepository} from './storage-node.repository';

export class StorageNodeMetadataRepository extends PaginationRepository<
  StorageNodeMetadata,
  typeof StorageNodeMetadata.prototype.id,
  StorageNodeMetadataRelations
> {
  public readonly node: BelongsToAccessor<
    StorageNode,
    typeof StorageNodeMetadata.prototype.id
  >;

  constructor(
    @inject('datasources.Db') dataSource: DbDataSource,
    @repository.getter('StorageNodeRepository')
    protected storageNodeRepositoryGetter: Getter<StorageNodeRepository>,
  ) {
    super(StorageNodeMetadata, dataSource);
    this.node = this.createBelongsToAccessorFor(
      'node',
      storageNodeRepositoryGetter,
    );
  }
}
