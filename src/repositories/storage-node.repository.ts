import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  FilterExcludingWhere,
  HasManyRepositoryFactory,
  Options,
  repository,
} from '@loopback/repository';
import {DbDataSource} from '../datasources';
import {
  NodeStatus,
  StorageNode,
  StorageNodeMetadata,
  StorageNodeRelations,
} from '../models';
import {PaginationRepository} from './proto/pagination-repository.proto';
import {StorageNodeMetadataRepository} from './storage-node-metadata.repository';

export class StorageNodeRepository extends PaginationRepository<
  StorageNode,
  typeof StorageNode.prototype.id,
  StorageNodeRelations
> {
  public readonly metadata: HasManyRepositoryFactory<
    StorageNodeMetadata,
    typeof StorageNode.prototype.id
  >;

  public readonly parent: BelongsToAccessor<
    StorageNode,
    typeof StorageNode.prototype.id
  >;

  public readonly children: HasManyRepositoryFactory<
    StorageNode,
    typeof StorageNode.prototype.id
  >;

  constructor(
    @inject('datasources.Db') dataSource: DbDataSource,
    @repository.getter('StorageNodeMetadataRepository')
    protected storageNodeMetadataRepositoryGetter: Getter<StorageNodeMetadataRepository>,
  ) {
    super(StorageNode, dataSource);
    this.children = this.createHasManyRepositoryFactoryFor(
      'children',
      Getter.fromValue(this),
    );
    this.registerInclusionResolver('children', this.children.inclusionResolver);
    this.parent = this.createBelongsToAccessorFor(
      'parent',
      Getter.fromValue(this),
    );
    this.registerInclusionResolver('parent', this.parent.inclusionResolver);
    this.metadata = this.createHasManyRepositoryFactoryFor(
      'metadata',
      storageNodeMetadataRepositoryGetter,
    );
    this.registerInclusionResolver('metadata', this.metadata.inclusionResolver);
  }

  public findActiveById(
    id: number,
    filter?: FilterExcludingWhere<StorageNode>,
    options?: Options,
  ): Promise<(StorageNode & StorageNodeRelations) | null> {
    return this.findOne({
      where: {
        id,
        status: NodeStatus.ACTIVE,
      },
    });
  }
}
