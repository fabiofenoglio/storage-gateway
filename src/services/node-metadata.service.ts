import {inject, injectable, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {juggler, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {SecurityBindings} from '@loopback/security';
import {ClientProfile} from '.';
import {LoggerBindings} from '../key';
import {
  ClientTenant,
  Page,
  Pageable,
  StorageNode,
  StorageNodeMetadata,
} from '../models';
import {StorageNodeMetadataRepository} from '../repositories';
import {PatchMetadataRequest, UpdateMetadataRequest} from '../rest';
import {CreateMetadataRequest} from '../rest/create-metadata/create-metadata-request.model';
import {CreateMetadataResponse} from '../rest/create-metadata/create-metadata-response.model';
import {GetMetadataResponse} from '../rest/get-metadata/get-metadata-response.model';
import {ListMetadataRequest} from '../rest/list-metadata/list-metadata-request.model';
import {ListMetadataResponse} from '../rest/list-metadata/list-metadata-response.model';
import {UpdateMetadataResponse} from '../rest/update-metadata/update-metadata-response.model';
import {UpdateNodeMetadataRequest} from '../rest/update-node/update-node-metadata-request.model';
import {EntityUtils} from '../utils';
import {FilterUtils} from '../utils/filter-utils';
import {PaginationUtils} from '../utils/pagination-utils';
import {SanitizationUtils} from '../utils/sanitization-utils';
import {MapperService} from './mapper.service';
import {TransactionService} from './transaction-manager.service';

@injectable()
export class NodeMetadataService {
  engineVersion = 1;

  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER) private logger: WinstonLogger,
    @inject(SecurityBindings.USER, {optional: true})
    private client: ClientProfile,
    @repository(StorageNodeMetadataRepository)
    private storageNodeMetadataRepository: StorageNodeMetadataRepository,
    @service(MapperService) private mapperService: MapperService,
    @service(TransactionService) private transactionService: TransactionService,
  ) {}

  public async listMetadata(
    tenant: ClientTenant,
    node: StorageNode,
    pageable: Pageable,
    filter?: ListMetadataRequest,
  ): Promise<{
    entities: StorageNodeMetadata[];
    dto: ListMetadataResponse;
  }> {
    if (!tenant || !node?.id) {
      throw new HttpErrors.BadRequest();
    }

    const metadata = await this.fetchMetadata(
      node,
      undefined,
      undefined,
      pageable,
      filter,
    );

    return {
      entities: metadata.content,
      dto: new ListMetadataResponse({
        ...metadata,
        content: metadata.content.map(o => this.mapperService.toMetadataDto(o)),
      }),
    };
  }

  public async getMetadata(
    tenant: ClientTenant,
    node: StorageNode,
    metadataKey: string,
  ): Promise<{
    entity: StorageNodeMetadata;
    dto: GetMetadataResponse;
  }> {
    if (!tenant || !node?.id || !metadataKey) {
      throw new HttpErrors.BadRequest();
    }
    metadataKey = SanitizationUtils.sanitizeMetadataKey(metadataKey);

    const metadata = await this.findOrNotFound(node, metadataKey);

    return {
      entity: metadata,
      dto: new GetMetadataResponse({
        ...this.mapperService.toMetadataDto(metadata),
      }),
    };
  }

  public async createMetadata(
    tenant: ClientTenant,
    node: StorageNode,
    request: CreateMetadataRequest,
  ): Promise<CreateMetadataResponse> {
    if (!tenant || !node?.id || !request) {
      throw new HttpErrors.BadRequest();
    }

    SanitizationUtils.sanitizeMetadataKey(this.getOrBadRequest(request, 'key'));

    const saved = await this.transactionService.inTransaction(
      async transaction => {
        // insert new metadata
        return this.insert(node, request, transaction);
      },
    );

    // map to dto and return
    return new CreateMetadataResponse({
      ...this.mapperService.toMetadataDto(saved),
    });
  }

  public async updateMetadata(
    tenant: ClientTenant,
    node: StorageNode,
    metadataKey: string,
    request: UpdateMetadataRequest,
  ): Promise<UpdateMetadataResponse> {
    if (!tenant || !node?.id || !metadataKey || !request) {
      throw new HttpErrors.BadRequest();
    }

    metadataKey = SanitizationUtils.sanitizeMetadataKey(metadataKey);
    const metadata = await this.findOrNotFound(node, metadataKey);

    await this.transactionService.inTransaction(async transaction => {
      // do update
      await this.update(metadata, request, transaction);
    });

    // map to dto and return
    return new UpdateMetadataResponse({
      ...this.mapperService.toMetadataDto(metadata),
    });
  }

  public async deleteMetadata(
    tenant: ClientTenant,
    node: StorageNode,
    metadataKey: string,
  ): Promise<void> {
    if (!tenant || !node?.id || !metadataKey) {
      throw new HttpErrors.BadRequest();
    }

    metadataKey = SanitizationUtils.sanitizeMetadataKey(metadataKey);

    // retrieve node
    const metadata = await this.findOrNotFound(node, metadataKey);

    await this.transactionService.inTransaction(async transaction => {
      // do delete
      await this.delete(metadata, transaction);
    });
  }

  public async updateMetadataBatch(
    node: StorageNode,
    existing: StorageNodeMetadata[],
    request: (PatchMetadataRequest | UpdateNodeMetadataRequest)[],
    transaction: juggler.Transaction,
  ): Promise<StorageNodeMetadata[]> {
    for (const inputEntry of request) {
      SanitizationUtils.sanitizeMetadataKey(inputEntry.key);
    }

    // compare existing metadata with request metadata
    const compareResults = EntityUtils.compareLists(
      existing,
      request,
      (db, req) => db.key === req.key,
    );
    const output: StorageNodeMetadata[] = [];

    for (const toDelete of compareResults.inFirstNotInSecond) {
      // delete old metadata
      await this.delete(toDelete, transaction);
    }

    for (const toUpdate of compareResults.inBoth) {
      // update existing metadata
      const updated = await this.update(
        toUpdate.first,
        toUpdate.second,
        transaction,
      );
      output.push(updated);
    }

    for (const toInsert of compareResults.inSecondNotInFirst) {
      // insert new metadata
      const created = await this.insert(node, toInsert, transaction);
      output.push(created);
    }

    return output;
  }

  public async patchMetadataBatch(
    node: StorageNode,
    existing: StorageNodeMetadata[],
    request: (PatchMetadataRequest | UpdateNodeMetadataRequest)[],
    transaction: juggler.Transaction,
  ): Promise<StorageNodeMetadata[]> {
    for (const inputEntry of request) {
      SanitizationUtils.sanitizeMetadataKey(inputEntry.key);
    }

    // compare existing metadata with request metadata
    const compareResults = EntityUtils.compareLists(
      existing,
      request,
      (db, req) => db.key === req.key,
    );
    const output: StorageNodeMetadata[] = [];

    for (const toUpdate of compareResults.inBoth) {
      // update existing metadata
      const updated = await this.update(
        toUpdate.first,
        toUpdate.second,
        transaction,
      );
      output.push(updated);
    }

    for (const toInsert of compareResults.inSecondNotInFirst) {
      // insert new metadata
      const created = await this.insert(node, toInsert, transaction);
      output.push(created);
    }

    return output;
  }

  public async insertMetadataBatch(
    node: StorageNode,
    request: CreateMetadataRequest[],
    transaction: juggler.Transaction,
  ): Promise<StorageNodeMetadata[]> {
    const output: StorageNodeMetadata[] = [];

    for (const inputEntry of request) {
      SanitizationUtils.sanitizeMetadataKey(inputEntry.key);
    }

    for (const toInsert of request) {
      // insert new metadata
      const created = await this.insert(node, toInsert, transaction);
      output.push(created);
    }

    return output;
  }

  private async insert(
    node: StorageNode,
    request: CreateMetadataRequest | UpdateNodeMetadataRequest,
    transaction: juggler.Transaction,
  ): Promise<StorageNodeMetadata> {
    const entity = new StorageNodeMetadata({
      key: SanitizationUtils.sanitizeMetadataKey(
        this.getOrBadRequest(request, 'key'),
      ),
      value: this.getOrBadRequest(request, 'value'),
      engineVersion: this.engineVersion,
      nodeId: this.getOrBadRequest(node, 'id'),
      version: 1,
      createdAt: new Date(),
      createdBy: this.client.code,
    });

    // check if already existing
    if (
      (await this.fetchMetadata(node, entity.key, transaction)).totalElements
    ) {
      throw new HttpErrors.Conflict(
        'Metadata with key ' +
          entity.key +
          ' already exists on node ' +
          node.uuid,
      );
    }

    const saved = await this.storageNodeMetadataRepository.create(entity, {
      transaction,
    });
    return saved;
  }

  private async update(
    entity: StorageNodeMetadata,
    request: UpdateMetadataRequest | UpdateNodeMetadataRequest,
    transaction: juggler.Transaction,
  ): Promise<StorageNodeMetadata> {
    // if optimistic lock provided, check audit data
    if (request.audit?.version) {
      if (request.audit.version !== entity.version) {
        throw new HttpErrors.Conflict(
          'Optimistic lock failed: provided version ' +
            request.audit.version +
            ' but current version is ' +
            entity.version,
        );
      }
    }

    // update entity fields
    entity.value = request.value;

    // update audit fields
    entity.version = (entity.version ?? 0) + 1;
    entity.modifiedBy = this.client.code;
    entity.modifiedAt = new Date();

    await this.storageNodeMetadataRepository.update(entity, {transaction});
    return entity;
  }

  private async delete(
    metadata: StorageNodeMetadata,
    transaction: juggler.Transaction,
  ): Promise<void> {
    await this.storageNodeMetadataRepository.delete(metadata, {transaction});
  }

  public async batchDelete(
    tenant: ClientTenant,
    nodes: StorageNode[],
    transaction: juggler.Transaction,
  ): Promise<void> {
    this.requireExistingTransaction(transaction);
    if (!tenant?.id) {
      throw new HttpErrors.BadRequest();
    }
    if (!nodes?.length) {
      return;
    }

    // delegate content deletion to specific backbone manager
    this.logger.debug(
      'attempting batch metadata delete for ' + nodes.length + ' nodes',
    );

    const deleteResult = await this.storageNodeMetadataRepository.deleteAll(
      {
        nodeId: {
          inq: nodes.map(o => o.id!),
        },
      },
      {transaction},
    );

    this.logger.verbose('deleted ' + deleteResult.count + ' metadata records');
    this.logger.verbose(
      'finished batch metadata delete for ' + nodes.length + ' nodes',
    );
  }

  private getOrBadRequest<T, K extends keyof T>(
    obj: T,
    key: K,
  ): NonNullable<T[K]> {
    const v = obj[key]; // Inferred type is T[K]
    if (typeof v === 'undefined' || v === null) {
      throw new HttpErrors.BadRequest('Field ' + key + ' is required');
    }
    return v!;
  }

  public async fetchMetadata(
    node: StorageNode,
    key: string | undefined = undefined,
    transaction: juggler.Transaction | undefined = undefined,
    pageable: Pageable | undefined = undefined,
    filter: ListMetadataRequest | undefined = undefined,
  ): Promise<Page<StorageNodeMetadata>> {
    if (!node?.id) {
      throw new Error('Node.Id is required');
    }
    if (key) {
      key = SanitizationUtils.sanitizeMetadataKey(key);
    }

    return this.storageNodeMetadataRepository.findPage(
      {
        where: {
          nodeId: node.id,
          key,
          and: [
            {
              key: FilterUtils.stringFilter(filter?.key),
            },
          ],
        },
        order: ['key ASC'],
      },
      pageable ?? PaginationUtils.unpaged(),
      {transaction},
    );
  }

  private async findOrNotFound(
    node: StorageNode,
    metadataKey: string,
  ): Promise<StorageNodeMetadata & Required<Pick<StorageNodeMetadata, 'id'>>> {
    if (!node || !metadataKey) {
      throw new HttpErrors.BadRequest();
    }
    metadataKey = SanitizationUtils.sanitizeMetadataKey(metadataKey);

    const entity = await this.storageNodeMetadataRepository.findOne({
      where: {
        nodeId: node.id,
        key: metadataKey,
      },
    });

    if (!entity || !entity?.id) {
      throw new HttpErrors.NotFound();
    }

    return entity as StorageNodeMetadata &
      Required<Pick<StorageNodeMetadata, 'id'>>;
  }

  private requireExistingTransaction(
    transaction: juggler.Transaction | undefined,
  ) {
    if (!transaction) {
      throw new Error(
        'An active transactional context is required but no transaction was given.',
      );
    }
  }
}
