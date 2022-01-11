/* eslint-disable @typescript-eslint/no-explicit-any */
import {inject, injectable, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {juggler, repository, Where} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {SecurityBindings} from '@loopback/security';
import {v4 as uuidv4} from 'uuid';
import {LoggerBindings} from '../key';
import {
  ClientTenant,
  NodeStatus,
  Page,
  Pageable,
  StorageNode,
  StorageNodeMetadata,
  StorageNodeType,
} from '../models';
import {
  AclStorageNodeRecordRepository,
  ClientTenantRepository,
  StorageNodeMetadataRepository,
  StorageNodeRepository,
} from '../repositories';
import {
  CreateNodeRequest,
  CreateNodeResponse,
  PatchNodeRequest,
  PatchNodeResponse,
  StorageNodeResumeDto,
  UpdateNodeRequest,
  UpdateNodeResponse,
} from '../rest';
import {BatchDeleteNodesRequest} from '../rest/batch-delete-nodes/batch-delete-nodes-request.model';
import {BatchDeleteNodesResponse} from '../rest/batch-delete-nodes/batch-delete-nodes-response.model';
import {BatchGetNodesRequest} from '../rest/batch-get-nodes/batch-get-nodes-request.model';
import {BatchGetNodesResponse} from '../rest/batch-get-nodes/batch-get-nodes-response.model';
import {BatchNodesSelectorMetadataRequest} from '../rest/batch-nodes/batch-nodes-selector-metadata.model';
import {BatchNodesSelectorRequest} from '../rest/batch-nodes/batch-nodes-selector.model';
import {BatchPatchNodesRequest} from '../rest/batch-patch-nodes/batch-patch-nodes-request.model';
import {BatchPatchNodesResponse} from '../rest/batch-patch-nodes/batch-patch-nodes-response.model';
import {GetNodeResponse} from '../rest/get-node/get-node-response.model';
import {ListNodesRequest} from '../rest/list-nodes/list-nodes-request.model';
import {ListNodesResponse} from '../rest/list-nodes/list-nodes-response.model';
import {ListRootNodesRequest} from '../rest/list-nodes/list-root-nodes-request.model';
import {Security} from '../security';
import {ObjectUtils} from '../utils';
import {FilterUtils} from '../utils/filter-utils';
import {PathUtils} from '../utils/path-utils';
import {SanitizationUtils} from '../utils/sanitization-utils';
import {AclService} from './acl.service';
import {ClientProfile, SystemClient} from './client-profile.service';
import {ContentService} from './content/content.service';
import {MapperService} from './mapper.service';
import {NodeMetadataService} from './node-metadata.service';
import {NodeShareService} from './node-share.service';

export interface PathResolveResult {
  node: StorageNode | null;
  root: boolean;
  found: boolean;
}

export interface ClosestNodePathResolveResult {
  node: StorageNode | null;
  root: boolean;
  remainingPath: string | null;
}

@injectable()
export class StorageNodeService {
  engineVersion = 1;

  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER) private logger: WinstonLogger,
    @inject(SecurityBindings.USER, {optional: true})
    private client: ClientProfile,
    @repository(ClientTenantRepository)
    private clientTenantRepository: ClientTenantRepository,
    @repository(StorageNodeRepository)
    private storageNodeRepository: StorageNodeRepository,
    @repository(AclStorageNodeRecordRepository)
    private storageNodeAclRecordRepository: AclStorageNodeRecordRepository,
    @repository(StorageNodeMetadataRepository)
    private storageNodeMetadataRepository: StorageNodeMetadataRepository,
    @service(ContentService) private contentService: ContentService,
    @service(MapperService) private mapperService: MapperService,
    @service(NodeMetadataService) private metadataService: NodeMetadataService,
    @service(NodeShareService) private nodeShareService: NodeShareService,
    @service(AclService) private aclService: AclService,
  ) {}

  public async fetchById(id: number): Promise<StorageNode> {
    if (!id) {
      throw new HttpErrors.BadRequest();
    }
    return this.findOrNotFound(undefined, undefined, id);
  }

  public async fetch(
    tenant: ClientTenant,
    nodeUUID: string,
  ): Promise<StorageNode> {
    if (!tenant || !nodeUUID) {
      throw new HttpErrors.BadRequest();
    }
    nodeUUID = SanitizationUtils.sanitizeUUID(nodeUUID);

    return this.findOrNotFound(tenant, nodeUUID);
  }

  public async getRootItems(
    tenant: ClientTenant,
    pageable: Pageable,
    filter?: ListRootNodesRequest,
  ): Promise<ListNodesResponse> {
    if (!tenant) {
      throw new HttpErrors.BadRequest();
    }

    const result = await this.storageNodeRepository.findPage(
      {
        where: {
          status: NodeStatus.ACTIVE,
          tenantId: tenant.id,
          parentId: {
            eq: null,
          } as any,
          and: filter ? [this.buildFilter(filter)] : undefined,
        },
        order: ['name ASC', 'type ASC', 'uuid ASC'],
      },
      pageable,
    );

    return this.toListNodesResponse(tenant, result);
  }

  private async toListNodesResponse(
    tenant: ClientTenant,
    pageResponse: Page<StorageNode>,
  ): Promise<ListNodesResponse> {
    const content: StorageNodeResumeDto[] = [];
    for (const entity of pageResponse.content) {
      const metadata = await this.metadataService.fetchMetadata(entity);
      const fileContent = await this.contentService.getContent(tenant, entity);
      content.push(
        this.mapperService.toStorageNodeResumeDto(
          entity,
          fileContent?.entity,
          metadata.content,
        ),
      );
    }
    return new ListNodesResponse({
      ...pageResponse,
      content,
    });
  }

  public async getNode(
    tenant: ClientTenant,
    nodeUUID: string,
  ): Promise<{entity: StorageNode; dto: GetNodeResponse}> {
    nodeUUID = SanitizationUtils.sanitizeUUID(nodeUUID);
    if (!tenant || !nodeUUID) {
      throw new HttpErrors.BadRequest();
    }

    const entity = await this.findOrNotFound(tenant, nodeUUID);
    const metadata = await this.metadataService.fetchMetadata(entity);
    const content = await this.contentService.getContent(tenant, entity);

    const dto = new GetNodeResponse({
      ...this.mapperService.toStorageNodeDetailDto(
        entity,
        content?.entity,
        metadata.content,
      ),
    });

    return {
      entity,
      dto,
    };
  }

  public async getChildren(
    tenant: ClientTenant,
    nodeUUID: string,
    pageable: Pageable,
    filter?: ListNodesRequest,
  ): Promise<ListNodesResponse> {
    if (!tenant || !nodeUUID) {
      throw new HttpErrors.BadRequest();
    }
    nodeUUID = SanitizationUtils.sanitizeUUID(nodeUUID);

    const parentNode = await this.findOrNotFound(tenant, nodeUUID);

    if (parentNode.type !== StorageNodeType.FOLDER) {
      throw new HttpErrors.BadRequest(
        'Cannot retrieve children on ' + parentNode.type + ' node',
      );
    }

    const childPage = await this.storageNodeRepository.findPage(
      {
        where: {
          parentId: parentNode.id,
          status: NodeStatus.ACTIVE,
          and: [
            {
              name: FilterUtils.stringFilter(filter?.name),
              type: FilterUtils.enumFilter(filter?.type),
            },
          ],
        },
        order: ['name ASC', 'type ASC', 'uuid ASC'],
      },
      pageable,
    );

    return this.toListNodesResponse(tenant, childPage);
  }

  public async createInRoot(
    tenant: ClientTenant,
    request: CreateNodeRequest,
    existingTransaction?: juggler.Transaction,
  ): Promise<{
    entity: StorageNode;
    dtoProvider: () => Promise<CreateNodeResponse>;
  }> {
    if (!tenant || !request) {
      throw new HttpErrors.BadRequest();
    }

    const createdPL = await this.createItemInTenant(
      tenant,
      null,
      request,
      existingTransaction,
    );

    const dtoProvider = async () => {
      // reload created element and return response
      const created = await this.storageNodeRepository.findById(createdPL.id);
      const content = await this.contentService.getContent(tenant, created);
      const metadata = await this.metadataService.fetchMetadata(created);

      const nodeDetails = this.mapperService.toStorageNodeDetailDto(
        created,
        content?.entity,
        metadata.content,
      );
      return new CreateNodeResponse({
        ...nodeDetails,
      });
    };

    return {
      entity: createdPL,
      dtoProvider,
    };
  }

  public async createChildrenInNewDirectory(
    tenant: ClientTenant,
    node: StorageNode | null,
    path: string,
    request: CreateNodeRequest,
    existingTransaction?: juggler.Transaction,
  ): Promise<{
    entity: StorageNode;
    dtoProvider: () => Promise<CreateNodeResponse>;
  }> {
    if (!tenant || !ObjectUtils.isDefined(path) || !request) {
      throw new HttpErrors.BadRequest();
    }

    if (ObjectUtils.isDefined(path)) {
      path = SanitizationUtils.sanitizePath(path);
    }

    const createdPL = await this.storageNodeRepository.inTransaction(
      async transaction => {
        this.logger.debug(
          `creating directory because it does not exist: ${tenant.code}:${path}`,
        );
        const parentNode = await this.createDirectoryIfMissing(
          tenant,
          node ?? null,
          path,
          transaction,
        );

        this.logger.verbose(
          `created directory because it did not exist: ${tenant.code}:${path}`,
        );
        return this.createItemInTenant(
          tenant,
          parentNode,
          request,
          transaction,
        );
      },
      existingTransaction,
    );

    const dtoProvider = async () => {
      // reload created element and return response
      const created = await this.storageNodeRepository.findById(createdPL.id);
      const content = await this.contentService.getContent(tenant, created);
      const metadata = await this.metadataService.fetchMetadata(created);

      const nodeDetails = this.mapperService.toStorageNodeDetailDto(
        created,
        content?.entity,
        metadata.content,
      );
      const response = new CreateNodeResponse({
        ...nodeDetails,
      });
      return response;
    };

    return {
      entity: createdPL,
      dtoProvider,
    };
  }

  public async createChildren(
    tenant: ClientTenant,
    itemUUID: string,
    request: CreateNodeRequest,
    existingTransaction?: juggler.Transaction,
  ): Promise<{
    entity: StorageNode;
    dtoProvider: () => Promise<CreateNodeResponse>;
  }> {
    if (!tenant || !itemUUID || !request) {
      throw new HttpErrors.BadRequest();
    }

    itemUUID = SanitizationUtils.sanitizeUUID(itemUUID);

    const parentNode = await this.findOrNotFound(tenant, itemUUID);
    if (parentNode.type !== StorageNodeType.FOLDER) {
      throw new HttpErrors.BadRequest(
        'Cannot create child on ' + parentNode.type + ' node',
      );
    }

    const createdPL = await this.createItemInTenant(
      tenant,
      parentNode,
      request,
      existingTransaction,
    );

    const dtoProvider = async () => {
      // reload created element and return response
      const created = await this.storageNodeRepository.findById(createdPL.id);
      const content = await this.contentService.getContent(tenant, created);
      const metadata = await this.metadataService.fetchMetadata(created);

      const nodeDetails = this.mapperService.toStorageNodeDetailDto(
        created,
        content?.entity,
        metadata.content,
      );
      const response = new CreateNodeResponse({
        ...nodeDetails,
      });

      return response;
    };

    return {
      entity: createdPL,
      dtoProvider,
    };
  }

  public async createItemInTenant(
    tenant: ClientTenant,
    parentNode: StorageNode | null,
    request: CreateNodeRequest,
    existingTransaction?: juggler.Transaction,
  ): Promise<StorageNode> {
    if (!tenant || !request) {
      throw new HttpErrors.BadRequest();
    }

    if (parentNode) {
      if (parentNode.type !== StorageNodeType.FOLDER) {
        throw new HttpErrors.BadRequest(
          'Cannot create child on ' + parentNode.type + ' node',
        );
      }
    }

    const name = SanitizationUtils.sanitizeFilename(
      this.getOrBadRequest(request, 'name'),
    );
    const type = SanitizationUtils.sanitizeNodeType(
      this.getOrBadRequest(request, 'type'),
    );

    const entity = new StorageNode({
      tenantId: tenant.id,
      uuid: uuidv4(),
      engineVersion: this.engineVersion,
      type,
      name,
      parentId: parentNode?.id,
      parentUuid: parentNode?.uuid,
      version: 1,
      createdAt: new Date(),
      createdBy: this.client.code,
      status: 'ACTIVE',
    });

    const savedMetadata: StorageNodeMetadata[] = [];
    let saved: StorageNode | undefined;

    await this.storageNodeRepository.inTransaction(async transaction => {
      // ensure no duplicate child
      if (
        await this.findByName(
          entity.tenantId,
          parentNode?.id,
          name,
          transaction,
        )
      ) {
        throw new HttpErrors.Conflict(
          'Duplicate child node with name ' +
            name +
            ' in ' +
            (parentNode?.uuid ?? 'root'),
        );
      }

      // insert storage node
      saved = await this.storageNodeRepository.create(entity, {transaction});

      // insert metadata
      if (request.metadata) {
        const savedMetas = await this.metadataService.insertMetadataBatch(
          saved,
          request.metadata,
          transaction,
        );
        for (const savedMeta of savedMetas) {
          savedMetadata.push(savedMeta);
        }
      }
    }, existingTransaction);

    return saved!;
  }

  public async patchNode(
    tenant: ClientTenant,
    itemUUID: string,
    request: PatchNodeRequest,
  ): Promise<PatchNodeResponse> {
    itemUUID = SanitizationUtils.sanitizeUUID(itemUUID);
    return this.updateOrPatch(tenant, itemUUID, request, true);
  }

  public async updateNode(
    tenant: ClientTenant,
    itemUUID: string,
    request: UpdateNodeRequest,
  ): Promise<UpdateNodeResponse> {
    itemUUID = SanitizationUtils.sanitizeUUID(itemUUID);
    return this.updateOrPatch(tenant, itemUUID, request, false);
  }

  public async deleteNode(
    tenant: ClientTenant,
    itemUUID: string,
  ): Promise<void> {
    if (!tenant?.id || !itemUUID) {
      throw new HttpErrors.BadRequest();
    }
    itemUUID = SanitizationUtils.sanitizeUUID(itemUUID);
    const entity = await this.findOrNotFound(tenant, itemUUID);

    this.logger.verbose(`deleting node ${entity.uuid}`);

    await this.storageNodeRepository.inTransaction(async transaction => {
      // delete children nodes
      await this.deleteNodes(tenant, [entity], transaction);
    });
  }

  private async deleteNodes(
    tenant: ClientTenant,
    nodes: StorageNode[],
    transaction: juggler.Transaction,
  ): Promise<void> {
    this.requireExistingTransaction(transaction);
    if (!tenant?.id) {
      throw new Error('Tenant ID is required');
    }
    if (!nodes?.length) {
      return;
    }

    this.logger.verbose(`deleting ${nodes.length} nodes`);

    // delete children recursively
    this.logger.debug(
      `fetching children before deleting ${nodes.length} nodes`,
    );

    const pageRequest: Pageable = {page: 0, size: 10};
    const childrenFetchFilter = {
      where: {
        status: NodeStatus.ACTIVE,
        tenantId: tenant.id,
        parentId: {
          inq: nodes.map(o => o.id),
        },
      },
      order: ['id ASC'],
    };

    let childrenPageResponse = await this.storageNodeRepository.findPage(
      childrenFetchFilter,
      pageRequest,
      {transaction},
    );

    while (
      childrenPageResponse.hasContent &&
      childrenPageResponse.content?.length
    ) {
      this.logger.debug(
        `found ${childrenPageResponse.numberOfElements} children to delete, ${childrenPageResponse.totalElements} in total`,
      );

      await this.deleteNodes(tenant, childrenPageResponse.content, transaction);

      if (!childrenPageResponse.hasNext) {
        break;
      } else {
        // not incrementing requested page index ON PURPOSE
        childrenPageResponse = await this.storageNodeRepository.findPage(
          childrenFetchFilter,
          pageRequest,
          {transaction},
        );
      }
    }

    // delete metadata
    await this.metadataService.batchDelete(tenant, nodes, transaction);

    // delete ACL records
    await this.deleteAclRecordsForNodes(nodes, transaction);

    // delete shares
    await this.nodeShareService.batchDelete(tenant, nodes, transaction);

    // delete content
    await this.contentService.batchDelete(tenant, nodes, transaction);

    // delete node
    this.logger.debug(`removing node records for ${nodes.length} nodes`);

    /*
    const deleteResult = await this.storageNodeRepository.deleteAll(
      {
        id: {
          inq: nodes.map(o => o.id!),
        },
      },
      {transaction},
    );
    */
    // DELETE LOGICALLY
    const deleteResult = await this.storageNodeRepository.updateAll(
      {
        status: NodeStatus.DELETED,
        deletedAt: new Date(),
      },
      {
        id: {
          inq: nodes.map(o => o.id!),
        },
      },
      {
        transaction,
      },
    );

    this.logger.verbose(`deleted ${deleteResult.count} nodes`);
  }

  private async deleteAclRecordsForNodes(
    nodes: StorageNode[],
    transaction: juggler.Transaction,
  ) {
    this.logger.debug(`deleting ACL records for ${nodes.length} nodes`);
    const deleteResult = await this.storageNodeAclRecordRepository.deleteAll(
      {
        nodeId: {
          inq: nodes.map(o => o.id!),
        },
      },
      {transaction},
    );

    this.logger.verbose(`deleted ${deleteResult.count} ACL records`);
  }

  private async updateOrPatch(
    tenant: ClientTenant,
    itemUUID: string,
    request: UpdateNodeRequest | PatchNodeRequest,
    isPatch: boolean,
  ): Promise<UpdateNodeResponse | PatchNodeResponse> {
    if (!tenant || !itemUUID || !request) {
      throw new HttpErrors.BadRequest();
    }
    itemUUID = SanitizationUtils.sanitizeUUID(itemUUID);
    const entity = await this.findOrNotFound(tenant, itemUUID);

    await this.storageNodeRepository.inTransaction(async transaction => {
      return this.applyPatchOrUpdateToNode(
        entity,
        request,
        isPatch,
        transaction,
      );
    });

    // reload created element and return response
    const updatedMetadata = await this.metadataService.fetchMetadata(entity);
    const created = await this.storageNodeRepository.findById(entity.id);

    const content = await this.contentService.getContent(tenant, entity);

    const nodeDetails = this.mapperService.toStorageNodeDetailDto(
      created,
      content?.entity,
      updatedMetadata.content,
    );
    const response = isPatch
      ? new PatchNodeResponse({...nodeDetails})
      : new UpdateNodeResponse({...nodeDetails});
    return response;
  }

  private async applyPatchOrUpdateToNode(
    entity: StorageNode,
    request: PatchNodeRequest | UpdateNodeRequest,
    isPatch: boolean,
    transaction: juggler.Transaction,
  ): Promise<StorageNode> {
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

    let nameChanged = false;

    if (!isPatch || !!request.name) {
      const name = SanitizationUtils.sanitizeFilename(
        this.getOrBadRequest(request, 'name'),
      );
      nameChanged = name !== entity.name;

      // patch entity
      entity.name = name;
    }

    // update audit fields
    entity.modifiedAt = new Date();
    entity.modifiedBy = this.client.code;
    entity.version = (entity.version ?? 0) + 1;

    if (nameChanged && entity.name) {
      // ensure no duplicate child
      const existing = await this.findByName(
        entity.tenantId,
        entity.parentId ?? undefined,
        entity.name,
        transaction,
      );
      if (!!existing && existing.id !== entity.id) {
        throw new HttpErrors.Conflict(
          'Duplicate child node with name ' + entity.name,
        );
      }
    }

    // update storage node
    await this.storageNodeRepository.update(entity, {transaction});

    // update metadata
    if (isPatch) {
      if (request.metadata) {
        const metadata = await this.metadataService.fetchMetadata(entity);
        await this.metadataService.patchMetadataBatch(
          entity,
          metadata.content,
          request.metadata,
          transaction,
        );
      }
    } else {
      const metadata = await this.metadataService.fetchMetadata(entity);
      await this.metadataService.updateMetadataBatch(
        entity,
        metadata.content,
        request.metadata ?? [],
        transaction,
      );
    }

    return entity;
  }

  private async findByName(
    tenantId: number,
    parentNodeId: number | undefined,
    name: string,
    transaction: juggler.Transaction,
  ): Promise<StorageNode | null> {
    return this.storageNodeRepository.findOne(
      {
        where: {
          status: NodeStatus.ACTIVE,
          tenantId,
          name,
          parentId: {
            eq: parentNodeId ?? null,
          } as any,
        },
      },
      {
        transaction,
      },
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

  private async findOrNotFound(
    tenant?: ClientTenant,
    itemUUID?: string,
    id?: number,
  ): Promise<StorageNode & Required<Pick<StorageNode, 'id'>>> {
    if (!tenant && !itemUUID && !id) {
      throw new HttpErrors.BadRequest();
    }

    const entity = await this.storageNodeRepository.findOne({
      where: {
        id,
        status: NodeStatus.ACTIVE,
        uuid: itemUUID,
        tenantId: tenant?.id,
      },
    });

    if (!entity || !entity?.id) {
      throw new HttpErrors.NotFound();
    }

    return entity as StorageNode & Required<Pick<StorageNode, 'id'>>;
  }

  public async resolvePath(
    tenantId: number,
    path: string,
    from?: StorageNode,
  ): Promise<PathResolveResult> {
    if (!path) {
      throw new Error('Invalid path');
    }
    this.logger.debug(`resolving node for path ${path} in tenant ${tenantId}`);

    path = PathUtils.cleanPath(path);

    if (!path.startsWith('/')) {
      throw new Error('An absolute path is required, given ' + path);
    }

    if (path === '/') {
      return {
        node: from ?? null,
        root: !from,
        found: true,
      };
    }

    const tokens = path.substr(1).split('/');
    let actualNode: StorageNode | null = from ?? null;

    for (const token of tokens) {
      const tokenNode: StorageNode | null =
        await this.storageNodeRepository.findOne({
          where: {
            name: token,
            status: NodeStatus.ACTIVE,
            tenantId,
            parentId: actualNode ? actualNode.id : undefined,
          },
        });

      if (!tokenNode) {
        this.logger.verbose(
          `no node could be resolved for path ${path} in tenant ${tenantId}`,
        );
        return {
          node: null,
          root: false,
          found: false,
        };
      }

      actualNode = tokenNode;
    }

    this.logger.debug(
      `resolved path ${path} in tenant ${tenantId} to node ${actualNode?.uuid}`,
    );
    return {
      node: actualNode,
      root: false,
      found: true,
    };
  }

  private async createDirectoryIfMissing(
    tenant: ClientTenant,
    from: StorageNode | null,
    path: string,
    transaction: juggler.Transaction,
  ): Promise<StorageNode> {
    if (ObjectUtils.isDefined(path)) {
      path = SanitizationUtils.sanitizePath(path);
    }
    path = PathUtils.cleanPath(path);
    if (!tenant || !ObjectUtils.isDefined(path)) {
      throw new Error('Invalid path for creation procedure');
    }

    if (!path.startsWith('/')) {
      throw new Error('An absolute path is required, given ' + path);
    }

    if (path === '/') {
      if (from) {
        return from;
      }
      throw new HttpErrors.BadRequest('Cannot create ROOT directory');
    }

    this.logger.verbose(`creating path ${path} in ${from?.uuid ?? 'root'}`);

    const tokens = path.substr(1).split('/');
    let actualNode: StorageNode | null = from ?? null;

    for (const token of tokens) {
      const tokenNode: StorageNode | null =
        await this.storageNodeRepository.findOne(
          {
            where: {
              name: token,
              status: NodeStatus.ACTIVE,
              tenantId: tenant.id,
              parentId: actualNode ? actualNode.id : undefined,
            },
          },
          {transaction},
        );

      if (!tokenNode) {
        // create in this
        const createdNode = await this.storageNodeRepository.create(
          new StorageNode({
            tenantId: tenant.id,
            uuid: uuidv4(),
            parentUuid: actualNode ? actualNode.uuid : undefined,
            engineVersion: this.engineVersion,
            type: StorageNodeType.FOLDER,
            name: token,
            parentId: actualNode ? actualNode.id : undefined,
            version: 1,
            createdBy: (this.client ?? SystemClient).code,
            createdAt: new Date(),
            status: 'ACTIVE',
          }),
          {transaction},
        );

        this.logger.verbose(
          `created intermediate folder ${token} in ${
            actualNode?.uuid ?? 'root'
          }`,
        );

        actualNode = createdNode;
      } else {
        this.logger.debug(
          `not creating folder ${token} because it already exists in ${
            actualNode?.uuid ?? 'root'
          }`,
        );
        actualNode = tokenNode;
      }
    }

    this.logger.debug(
      `resolved path ${path} in tenant ${tenant.code} to node ${actualNode?.uuid}`,
    );

    if (!actualNode) {
      throw new HttpErrors.BadRequest('Cannot create ROOT directory');
    }
    return actualNode;
  }

  public async resolveClosestNode(
    tenantId: number,
    path: string,
    from?: StorageNode,
  ): Promise<ClosestNodePathResolveResult> {
    if (!path) {
      throw new Error('Invalid path');
    }
    this.logger.debug(
      `resolving closest node for path ${path} in tenant ${tenantId}`,
    );

    path = PathUtils.cleanPath(path);

    if (!path.startsWith('/')) {
      throw new Error('An absolute path is required, given ' + path);
    }

    if (path === '/') {
      return {
        node: from ?? null,
        root: !from,
        remainingPath: null,
      };
    }

    const tokens = path.substr(1).split('/');
    let actualNode: StorageNode | null = from ?? null;
    let remainingPath: string | null = null;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const tokenNode: StorageNode | null =
        await this.storageNodeRepository.findOne({
          where: {
            name: token,
            status: NodeStatus.ACTIVE,
            tenantId,
            parentId: actualNode ? actualNode.id : undefined,
          },
        });

      if (!tokenNode) {
        remainingPath = '/' + tokens.slice(i).join('/');
        break;
      }

      actualNode = tokenNode;
    }

    this.logger.debug(
      `resolved path ${path} in tenant ${tenantId} to node ${actualNode?.uuid}`,
    );
    return {
      node: actualNode,
      root: !actualNode,
      remainingPath,
    };
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

  private buildFilter(filter: ListRootNodesRequest): Where<StorageNode> {
    return {
      name: FilterUtils.stringFilter(filter?.name),
      type: FilterUtils.enumFilter(filter?.type),
    };
  }

  private buildBatchFilter(
    filter: BatchNodesSelectorRequest,
  ): Where<StorageNode> {
    // please notice: filter.metadata is applied manually as a second stage
    return {
      uuid: FilterUtils.stringFilter(filter?.uuid),
      name: FilterUtils.stringFilter(filter?.name),
      type: FilterUtils.enumFilter(filter?.type),
    };
  }

  async patchNodesBatch(
    request: BatchPatchNodesRequest,
  ): Promise<BatchPatchNodesResponse> {
    const out: BatchPatchNodesResponse = new BatchPatchNodesResponse({
      patchedNodes: 0,
    });

    await this.visitNodesBatch(
      request.where,
      async (tenant, nodes, transaction) => {
        await this.aclService.requirePermissionOnNodes(
          tenant,
          nodes,
          Security.Permissions.WRITE,
        );

        // apply patch to nodes
        for (const node of nodes) {
          this.logger.debug(`patching node ${node.id} with uuid ${node.uuid}`);
          await this.applyPatchOrUpdateToNode(node, request, true, transaction);
          out.patchedNodes++;
        }
      },
    );

    return out;
  }

  async deleteNodesBatch(
    request: BatchDeleteNodesRequest,
  ): Promise<BatchDeleteNodesResponse> {
    const out: BatchDeleteNodesResponse = new BatchDeleteNodesResponse({
      deletedNodes: 0,
    });

    await this.visitNodesBatch(
      request.where,
      async (tenant, nodes, transaction) => {
        await this.aclService.requirePermissionOnNodes(
          tenant,
          nodes,
          Security.Permissions.WRITE,
        );

        this.logger.debug(`deleting ${nodes.length} nodes`);
        await this.deleteNodes(tenant, nodes, transaction);
        out.deletedNodes += nodes.length;
      },
    );

    return out;
  }

  async searchNodesBatch(
    request: BatchGetNodesRequest,
  ): Promise<BatchGetNodesResponse> {
    const out: StorageNodeResumeDto[] = [];

    await this.visitNodesBatch(
      request.where,
      async (tenant, nodes, transaction) => {
        await this.aclService.requirePermissionOnNodes(
          tenant,
          nodes,
          Security.Permissions.READ,
        );

        // add nodes
        for (const entity of nodes) {
          /*
          const metadata = await this.metadataService.fetchMetadata(entity);
          const fileContent = await this.contentService.getContent(
            tenant,
            entity,
          );
          out.push(
            this.mapperService.toStorageNodeResumeDto(
              entity,
              fileContent?.entity,
              metadata.content,
            ),
          );
          */
          out.push(
            new StorageNodeResumeDto({
              uuid: entity.uuid,
              name: entity.name,
              type: entity.type,
            }),
          );
        }
      },
    );

    return new BatchGetNodesResponse({
      number: 0,
      size: out.length,
      totalElements: out.length,
      totalPages: 1,
      numberOfElements: out.length,
      content: out,
    });
  }

  private async visitNodesBatch(
    requestFilter: BatchNodesSelectorRequest,
    visit: (
      tenant: ClientTenant,
      nodes: StorageNode[],
      transaction: juggler.Transaction,
    ) => Promise<void>,
  ): Promise<void> {
    if (!requestFilter || !Object.keys(requestFilter).length) {
      throw new HttpErrors.BadRequest('No batch filter provided');
    }

    let currentId = 0;

    if (!requestFilter.tenant) {
      throw new HttpErrors.BadRequest('No tenant filter provided');
    }

    const tenants = await this.clientTenantRepository.find({
      where: {
        code: FilterUtils.stringFilter(requestFilter.tenant),
      },
    });

    if (!tenants.length) {
      this.logger.debug(`found no tenants to visit for batch operation`);
      return;
    } else {
      this.logger.debug(
        `found ${tenants.length} tenants to visit for batch operation`,
      );
    }

    const tenantMap: {[key: number]: ClientTenant} = {};
    for (const t of tenants) {
      tenantMap[t.id!] = t;
    }

    const fetcher = (maxId: number, transaction: juggler.Transaction) =>
      this.storageNodeRepository.findPage(
        {
          where: {
            tenantId: {
              inq: tenants.map(t => t.id!),
            },
            status: NodeStatus.ACTIVE,
            and: [
              this.buildBatchFilter(requestFilter),
              {
                id: {
                  gt: maxId,
                },
              },
            ],
          },
          order: ['id ASC'],
        },
        {page: 0, size: 50},
        {transaction},
      );

    await this.storageNodeRepository.inTransaction(async transaction => {
      let pageResponse = await fetcher(currentId, transaction);
      this.logger.debug(
        `found ${pageResponse.totalElements} nodes to visit for batch operation (before metadata filter)`,
      );

      while (pageResponse.hasContent) {
        const filtered = requestFilter.metadata?.length
          ? await this.applyMetadataFilter(
              pageResponse.content,
              requestFilter.metadata,
            )
          : pageResponse.content;

        if (filtered?.length) {
          // visit nodes
          this.logger.debug(
            `visiting ${filtered.length} nodes for batch operation`,
          );

          // group by tenantId
          const groupedByTenantId = ObjectUtils.groupBy(
            filtered,
            n => n.tenantId,
          );
          for (const entry of groupedByTenantId) {
            const tenant = tenantMap[entry[0]];
            await visit(tenant, entry[1], transaction);
          }
        }

        // fetch next page
        if (pageResponse.hasNext) {
          currentId = pageResponse.content[pageResponse.content.length - 1].id!;
          this.logger.debug(
            `fetching next page for batch operation starting with id greater than ${currentId}`,
          );
          pageResponse = await fetcher(currentId, transaction);
        } else {
          break;
        }
      }
    });
  }

  // this sucks. waiting for native support for related-fields-query
  private async applyMetadataFilter(
    nodes: StorageNode[],
    filter: BatchNodesSelectorMetadataRequest[],
  ): Promise<StorageNode[]> {
    if (!nodes?.length) {
      return nodes;
    }

    const filtered = await this.storageNodeMetadataRepository.find({
      where: {
        nodeId: {
          inq: nodes.map(n => n.id!),
        },
        and: filter.map(raw => this.buildMetadataFilter(raw)),
      },
      fields: ['id', 'nodeId'],
    });

    const filteredMapped: {[key: number]: boolean} = {};
    for (const filteredMD of filtered) {
      filteredMapped[filteredMD.nodeId] = true;
    }

    return nodes.filter(n => !!filteredMapped[n.id!]);
  }

  private buildMetadataFilter(
    raw: BatchNodesSelectorMetadataRequest,
  ): Where<StorageNodeMetadata> {
    const toJsonConverter = (v: any) => JSON.stringify(v);
    return {
      key: FilterUtils.anyFilter(raw.key),
      value: raw.value
        ? FilterUtils.anyFilter(raw.value, toJsonConverter)
        : undefined,
      and: raw.and?.length
        ? raw.and.map(x => this.buildMetadataFilter(x))
        : undefined,
      or: raw.or?.length
        ? raw.or.map(x => this.buildMetadataFilter(x))
        : undefined,
    };
  }
}
