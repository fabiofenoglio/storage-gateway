import {CipherGCM} from 'crypto';
import {v4 as uuidv4} from 'uuid';

import {service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {
  Condition,
  juggler,
} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';

import {
  AbstractBackbone,
  ClientTenant,
  ContentAssetMetadata,
  ContentEncryptionMetadata,
  ContentMetadata,
  ContentStreamer,
  ContentWithMetadata,
  DeferredContentRetriever,
  EncryptedContentLocatorWrapper,
  Page,
  Pageable,
  StorageNode,
  supportedEncryptionPolicies,
  UploadedContent,
} from '../../models';
import {
  AbstractContent,
  ContentStatus,
} from '../../models/content/abstract-content.model';
import {PaginationRepository} from '../../repositories';
import {RestContext} from '../../rest';
import {
  Constants,
  ObjectUtils,
  SanitizationUtils,
} from '../../utils';
import {DaoService} from '../dao.service';
import {TransactionService} from '../transaction-manager.service';
import {
  AbstractBackboneManagerService,
} from './abstract-backbone-manager.service';
import {
  AbstractContentManagerService,
} from './abstract-content-manager.service';
import {ContentProcessorService} from './content-processor.service';

export abstract class UnmanagedContentManagerService<
  T extends AbstractContent,
  C extends AbstractBackbone,
> extends AbstractContentManagerService<T> {
  defaultEngineVersion = 3;

  @service(ContentProcessorService)
  protected _contentProcessorService: ContentProcessorService;

  @service(TransactionService)
  protected _transactionService: TransactionService;

  @service(DaoService)
  protected _daoService: DaoService;

  constructor(protected _logger: WinstonLogger) {
    super(_logger);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract getRepository(): PaginationRepository<T, any, any>;

  protected abstract getBackboneManager(): AbstractBackboneManagerService<C>;

  protected get engineVersion(): number {
    return this.defaultEngineVersion;
  }

  protected async getBackbone(tenant: ClientTenant): Promise<C> {
    const bb = await this.getBackboneManager().findById(tenant.backboneId);
    if (!bb) {
      throw new Error('Backbone not found');
    }
    return bb;
  }

  protected instantiateForNode(
    context: RestContext,
    node: StorageNode,
    data?: Partial<T>,
  ): T {
    if (!node?.id || !node?.uuid) {
      throw new Error('A persisted node is required');
    }

    const partial: Partial<T> = {};
    partial.uuid = uuidv4();
    partial.engineVersion = this.engineVersion;
    partial.status = ContentStatus.DRAFT;
    partial.version = 1;
    partial.createdBy = this.clientIdentifier(context);
    partial.createdAt = new Date();
    partial.nodeId = node.id;
    partial.nodeUuid = node.uuid;

    if (data) {
      Object.assign(partial, data);
    }

    const repository = this.getRepository();

    return repository.instantiate(partial);
  }

  public async createContent(
    tenant: ClientTenant,
    node: StorageNode,
    key: string,
    contentSource: UploadedContent,
    context: RestContext,
  ): Promise<T> {
    if (!node?.id || !node?.uuid) {
      throw new Error('A persisted node is required');
    }
    if (!context?.client) {
      throw new Error('A REST context with authenticated client is required');
    }
    if (!contentSource) {
      throw new Error('A content source is required');
    }
    if (!key) {
      throw new Error('A content key is required');
    }
    if (!contentSource.content?.hasContent) {
      throw new Error('No content source provided');
    }

    const repository = this.getRepository();

    // check that content with provided key does not exist already
    if (await this.findByNodeAndKey(node, key, context.transaction)) {
      throw new HttpErrors.Conflict(
        `Content ${key} for node ${node.uuid} already exists`,
      );
    }

    const backbone = await this.getBackbone(tenant);

    const partial: Partial<T> = {};
    partial.key = key;
    partial.mimeType = contentSource.mimetype;
    partial.encoding = contentSource.encoding;
    partial.contentSize = contentSource.size;
    partial.originalName = this.sanitizeFilenameIfPresent(
      contentSource.originalname,
    );

    // create DRAFT content entity (out of transaction)
    let entity = this.instantiateForNode(context, node, partial);

    // storing draft content to destination
    this._logger.debug(
      `storing new draft content ${entity.key} - ${entity.uuid}`,
    );

    const writeContentWrapper = await this.wrapContentWithEncryption(
      contentSource.content,
      await this.getEncryptionSpecifications(tenant),
    );

    await this.storeContentInStorage(
      backbone,
      tenant,
      node,
      entity,
      writeContentWrapper.content,
    );

    await this.patchWithEncryptionDataAfterWrite(entity, writeContentWrapper);

    this._logger.verbose(
      `stored new draft content ${entity.key} - ${entity.uuid}`,
    );

    // save DRAFT content entity (out of transaction)
    entity = await repository.create(entity);

    // analyze content for metadata
    const metadata = await this.fetchMetadata(
      backbone,
      tenant,
      node,
      entity,
      contentSource,
    );

    entity.metadata = metadata;

    // update DRAFT content entity (out of transaction)
    await repository.update(entity);

    // check again that content with provided key does not exist already
    if (await this.findByNodeAndKey(node, key, context.transaction)) {
      throw new HttpErrors.Conflict(
        `Content ${key} for node ${node.uuid} already exists`,
      );
    }

    // move entity in ACTIVE status
    entity.status = ContentStatus.ACTIVE;

    // update new entity IN TRANSACTION
    await repository.update(entity, {
      transaction: context.transaction,
    });

    // return content
    this._logger.verbose(
      `created new active content record ${entity.id}:${entity.key} - ${entity.uuid}`,
    );
    return entity;
  }

  async updateContent(
    tenant: ClientTenant,
    node: StorageNode,
    key: string,
    contentSource: UploadedContent,
    context: RestContext,
  ): Promise<T> {
    if (!node?.id || !node?.uuid) {
      throw new Error('A persisted node is required');
    }
    if (!context?.client) {
      throw new Error('A REST context with authenticated client is required');
    }
    if (!contentSource) {
      throw new Error('A content source is required');
    }
    if (!key) {
      throw new Error('A content key is required');
    }
    if (!contentSource.content?.hasContent) {
      throw new Error('No content source provided');
    }

    const repository = this.getRepository();

    // check that entity to be replaced exists
    const oldEntity = await this.findByNodeAndKey(node, key);
    if (!oldEntity) {
      throw new HttpErrors.NotFound();
    }

    // check optimistic version lock
    if (contentSource.version) {
      if (oldEntity.version !== contentSource.version) {
        throw new HttpErrors.Conflict(
          'Optimistic lock failed: provided version ' +
            contentSource.version +
            ' but current version is ' +
            oldEntity.version,
        );
      }
    }

    const backbone = await this.getBackbone(tenant);

    // prepare new entity to replace the old one
    let newEntity = this.instantiateForNode(context, node, {
      ...oldEntity,
      id: undefined,
      status: ContentStatus.DRAFT,
      version: (oldEntity.version ?? 0) + 1,
      mimeType: contentSource.mimetype,
      encoding: contentSource.encoding,
      contentSize: contentSource.size,
      originalName: this.sanitizeFilenameIfPresent(contentSource.originalname),
      modifiedBy: this.clientIdentifier(context),
      modifiedAt: new Date(),
      lastDeleteAttemptAt: undefined,
      deletedAt: undefined,
    });

    // check content encryption specifications
    const encryptionSpecs = await this.getEncryptionSpecifications(tenant);
    const writeContentWrapper = await this.wrapContentWithEncryption(
      contentSource.content,
      encryptionSpecs,
    );

    // upload content to remote storage
    this._logger.debug(
      `storing draft updated content ${newEntity.id}:${newEntity.key} - ${newEntity.uuid}`,
    );

    await this.storeContentInStorage(
      backbone,
      tenant,
      node,
      newEntity,
      writeContentWrapper.content,
    );

    this._logger.verbose(
      `stored draft for updated content ${newEntity.id}:${newEntity.key} - ${newEntity.uuid}`,
    );

    // patch local record with encryption data
    await this.patchWithEncryptionDataAfterWrite(
      newEntity,
      writeContentWrapper,
    );

    // create new content entity
    newEntity = await repository.create(newEntity);

    // analyze content for metadata
    const metadata = await this.fetchMetadata(
      backbone,
      tenant,
      node,
      newEntity,
      contentSource,
    );

    newEntity.metadata = metadata;

    await repository.update(newEntity);

    // open transaction to switch contents
    await repository.inTransaction(async transaction => {
      // mark old content as DELETED
      oldEntity.status = ContentStatus.DELETED;
      oldEntity.deletedAt = new Date();
      await repository.update(oldEntity, {transaction});
      this._logger.verbose(
        `updated old content record ${oldEntity.id}:${oldEntity.key} - ${oldEntity.uuid} to status ${oldEntity.status}`,
      );

      // move entity in ACTIVE status
      newEntity.status = ContentStatus.ACTIVE;
      await repository.update(newEntity, {transaction});
      this._logger.verbose(
        `updated new content record ${newEntity.id}:${newEntity.key} - ${newEntity.uuid} to status ${newEntity.status}`,
      );
    }, context.transaction);

    // return content
    this._logger.verbose(
      `updated content record ${newEntity.id}:${newEntity.key} - ${newEntity.uuid}`,
    );
    return newEntity;
  }

  async getContent(
    tenant: ClientTenant,
    node: StorageNode,
    key: string,
    context: RestContext,
  ): Promise<T | null> {
    if (!node?.id || !node?.uuid) {
      throw new Error('A persisted node is required');
    }
    if (!context?.client) {
      throw new Error('A REST context with authenticated client is required');
    }
    if (!key) {
      throw new Error('A content key is required');
    }

    const entity = await this.findByNodeAndKey(node, key);
    if (!entity) {
      return null;
    }

    return entity;
  }

  async deleteContent(
    tenant: ClientTenant,
    node: StorageNode,
    key: string,
    context: RestContext,
  ): Promise<void> {
    if (!node?.id || !node?.uuid) {
      throw new Error('A persisted node is required');
    }
    if (!context?.client) {
      throw new Error('A REST context with authenticated client is required');
    }
    if (!key) {
      throw new Error('A content key is required');
    }

    const entity = await this.findByNodeAndKey(node, key);
    if (!entity) {
      return;
    }

    await this._transactionService.inTransaction(async transaction => {
      // remove node
      this._logger.debug(
        `removing content record ${entity.id}:${entity.key} - ${entity.uuid}`,
      );

      // await this.getRepository().delete(entity, {transaction});
      entity.status = ContentStatus.DELETED;
      entity.deletedAt = new Date();
      await this.getRepository().update(entity, {transaction});

      this._logger.verbose(
        `removed content record ${entity.id}:${entity.key} - ${entity.uuid}`,
      );
    }, context.transaction);
  }

  async retrieveContent(
    tenant: ClientTenant,
    node: StorageNode,
    key: string,
    context: RestContext,
  ): Promise<DeferredContentRetriever> {
    if (!node?.id || !node?.uuid) {
      throw new Error('A persisted node is required');
    }
    if (!context?.client) {
      throw new Error('A REST context with authenticated client is required');
    }
    if (!key) {
      throw new Error('A content key is required');
    }

    const entity = await this.findByNodeAndKey(node, key);
    if (!entity) {
      throw new HttpErrors.NotFound();
    }

    const backbone = await this.getBackbone(tenant);

    this._logger.verbose('fetching remote element content for node ' + node.id);

    const output: DeferredContentRetriever = {
      key: 'content.' + key,
      contentProvider: async () => {
        const remoteContentStreamer = await this.fetchContentFromStorage(
          backbone,
          tenant,
          node,
          entity,
        );

        if (!remoteContentStreamer) {
          throw new HttpErrors.NotFound('Node content not found');
        }

        return this.wrapContentWithDecryption(
          remoteContentStreamer,
          entity.contentSize ?? null,
          entity.encryption ?? null,
        );
      },
      contentETag: this.etag(entity),
      mimeType: entity.mimeType ?? 'application/octet-stream',
      contentSize: entity.contentSize,
      fileName: entity.originalName,
    };

    this._logger.verbose(
      `serving for retrieve content ${entity.id}:${entity.key} - ${entity.uuid}`,
    );
    return output;
  }

  async retrieveContentAsset(
    tenant: ClientTenant,
    node: StorageNode,
    contentKey: string,
    assetKey: string,
    context: RestContext,
  ): Promise<DeferredContentRetriever> {
    contentKey = SanitizationUtils.sanitizeContentKey(contentKey);
    assetKey = SanitizationUtils.sanitizeContentAssetKey(assetKey);

    const content = await this.findByNodeAndKey(node, contentKey);
    if (!content) {
      throw new HttpErrors.NotFound('Content not found');
    }

    // at the moment all assets are retrieved by key only
    const asset = content.metadata?.assets?.find(a => a.key === assetKey);
    if (!asset) {
      throw new HttpErrors.NotFound('Asset ' + assetKey + ' not found');
    }
    if (!asset.key) {
      throw new HttpErrors.NotFound(
        'Asset ' + assetKey + ' has no retrievable remote content',
      );
    }

    const backbone = await this.getBackbone(tenant);

    return {
      ...asset,
      contentProvider: async () => {
        const remoteContentStreamer = await this.fetchAssetContentFromStorage(
          backbone,
          tenant,
          node,
          content,
          asset,
        );

        if (!remoteContentStreamer) {
          throw new HttpErrors.NotFound('Node asset content not found');
        }

        return this.wrapContentWithDecryption(
          remoteContentStreamer,
          asset.contentSize ?? null,
          asset.encryption ?? null,
        );
      },
      contentETag: this.etag(content),
      mimeType: asset.mimeType ?? 'application/octet-stream',
      contentSize: asset.contentSize,
    };
  }

  protected etag(content: T): string {
    return content.metadata?.contentETag ?? 'CV' + content.version;
  }

  protected async patchWithEncryptionDataAfterWrite(
    entity: AbstractContent | ContentWithMetadata,
    wrapper: EncryptedContentLocatorWrapper,
  ) {
    if (wrapper.encryption?.alg) {
      const algSpecs = supportedEncryptionPolicies[wrapper.encryption.alg];
      if (algSpecs.authenticated) {
        wrapper.encryption.auth = (wrapper.cipher as CipherGCM)!
          .getAuthTag()
          .toString('hex');
      }
    }
    entity.encryption = new ContentEncryptionMetadata({
      ...wrapper.encryption,
    });
  }

  protected async findByNodeAndKey(
    node: StorageNode,
    key: string,
    transaction: juggler.Transaction | undefined = undefined,
  ): Promise<T | null> {
    if (!node?.id) {
      throw new Error('A persisted node is required');
    }
    if (!key) {
      throw new Error('A content key is required');
    }

    const findCondition: Condition<T> = {};
    findCondition.nodeId = node.id;
    findCondition.key = key;
    findCondition.status = {
      eq: ContentStatus.ACTIVE,
    };

    return this.getRepository().findOne(
      {
        where: findCondition,
      },
      {transaction},
    );
  }

  protected async fetchMetadata(
    backbone: C,
    tenant: ClientTenant,
    node: StorageNode,
    content: T,
    contentSource: UploadedContent,
  ): Promise<ContentMetadata> {
    return this._contentProcessorService.processContent(
      content,
      contentSource,
      {
        extractThumbnails: tenant.enableThumbnails ?? false,
        assetReceiver: async (asset: ContentWithMetadata) => {
          await this.storeAsset(backbone, tenant, node, content, asset);
          return true;
        },
      },
    );
  }

  private async storeAsset(
    backbone: C,
    tenant: ClientTenant,
    node: StorageNode,
    content: T,
    asset: ContentWithMetadata,
  ): Promise<void> {
    this._logger.verbose('storing asset ' + asset.key);

    const writeContentWrapper = await this.wrapContentWithEncryption(
      asset.content,
      await this.getEncryptionSpecifications(tenant),
    );

    await this.storeAssetContentInStorage(
      backbone,
      tenant,
      node,
      content,
      asset,
      writeContentWrapper.content,
    );

    await this.patchWithEncryptionDataAfterWrite(asset, writeContentWrapper);

    this._logger.verbose('stored asset ' + asset.key);
  }

  public async getContentQueuedForDeletion(page: Pageable): Promise<Page<T>> {
    const sixHoursAgo = new Date(
      new Date().getTime() - 6 * 60 * 60 * 1000, // 6 hours
    );

    return this.getRepository().findPage(
      {
        where: {
          and: [
            {
              or: [
                {
                  status: ContentStatus.DELETED,
                  deletedAt: {
                    neq: null as unknown as Date,
                    lte: sixHoursAgo,
                  },
                },
                // ||
                {
                  status: ContentStatus.DRAFT,
                  createdAt: {
                    neq: null as unknown as Date,
                    lte: sixHoursAgo,
                  },
                },
              ],
            },
            // &&
            {
              or: [
                {lastDeleteAttemptAt: {eq: null as unknown as Date}},
                // ||
                {lastDeleteAttemptAt: {lt: sixHoursAgo}},
              ],
            },
          ],
        } as Condition<T>,
        order: ['lastDeleteAttemptAt ASC', 'deletedAt ASC', 'id ASC'],
      },
      page,
    );
  }

  async deletePhysicalContent(
    entity: T,
    context: RestContext,
  ): Promise<boolean> {
    if (!entity?.id || !entity?.key) {
      throw new Error('A persisted content is required');
    }

    const repo = this.getRepository();

    // mark deletion attempt
    const now = new Date();
    entity.lastDeleteAttemptAt = now;
    await repo.update(entity); // not in transaction by design

    const node = await this._daoService.storageNodeRepository.findById(
      entity.nodeId!,
    );
    if (!node) {
      throw new Error('Node of entity content not found');
    }

    const tenant: ClientTenant =
      await this._daoService.clientTenantRepository.findById(node.tenantId);
    if (!tenant) {
      throw new Error('Tenant of entity content not found');
    }

    this._logger.debug(
      `deleting content ${entity.id}:${entity.key} - ${entity.uuid}`,
    );

    // remove physical content
    const backbone = await this.getBackbone(tenant);

    await this.deleteContentFromStorage(backbone, tenant, node, entity);

    this._logger.verbose(
      `deleted content record ${entity.id}:${entity.key} - ${entity.uuid}`,
    );

    for (const asset of entity.metadata?.assets ?? []) {
      this._logger.debug(
        `deleting content ${entity.id}:${entity.key} - ${entity.uuid} asset ${asset.key}`,
      );
      await this.deleteContentAssetFromStorage(
        backbone,
        tenant,
        node,
        entity,
        asset,
      );

      this._logger.verbose(
        `deleted content ${entity.id}:${entity.key} - ${entity.uuid} asset ${asset.key}`,
      );
    }

    await this.afterContentDeletion(backbone, tenant, node, entity);

    await repo.delete(entity, {
      transaction: context.transaction,
    });

    return true;
  }

  public async copyContent(
    sourceTenant: ClientTenant,
    sourceNode: StorageNode,
    targetTenant: ClientTenant,
    targetNode: StorageNode,
    outerContext: RestContext,
  ): Promise<T | null> {
    ObjectUtils.requireNotNull(sourceTenant);
    ObjectUtils.requireNotNull(sourceNode);
    ObjectUtils.requireNotNull(targetTenant);
    ObjectUtils.requireNotNull(targetNode);

    const key = Constants.CONTENT.DEFAULT_KEY;

    const sourceBackbone = await this.getBackbone(sourceTenant);
    const targetBackbone = await this.getBackbone(targetTenant);

    return this._transactionService.inTransaction(async transaction => {
      const context: RestContext = {...outerContext, transaction};

      const sourceContent = await this.findByNodeAndKey(
        sourceNode,
        key,
        context.transaction,
      );
      if (!sourceContent) {
        throw new HttpErrors.NotFound('Source content not found');
      }

      const targetExistingContent = await this.findByNodeAndKey(
        targetNode,
        key,
        context.transaction,
      );

      // make a copy of the content for the new node
      const copyAttributes: Partial<T> = {};
      copyAttributes.contentSize = sourceContent.contentSize;
      copyAttributes.encoding = sourceContent.encoding;
      copyAttributes.encryption = sourceContent.encryption;
      copyAttributes.engineVersion = this.engineVersion;
      copyAttributes.key = key;
      copyAttributes.mimeType = sourceContent.mimeType;
      copyAttributes.originalName = sourceContent.originalName;

      if (targetExistingContent) {
        // TODO create 'deactivate content' method ??
        targetExistingContent.status = ContentStatus.DELETED;
        targetExistingContent.deletedAt = new Date();
        await this.getRepository().update(targetExistingContent, {
          transaction: context.transaction,
        });

        copyAttributes.version = targetExistingContent.version + 1;
        copyAttributes.modifiedBy = this.clientIdentifier(context);
        copyAttributes.modifiedAt = new Date();
      }

      let newContentRecord = this.instantiateForNode(
        context,
        targetNode,
        copyAttributes,
      );

      // copy the metadata
      const newMetadata = new ContentMetadata({
        ...sourceContent.metadata,
        assets: [],
      });
      newContentRecord.metadata = newMetadata;

      // copy from the source file to the target file
      await this.copyContentInStorage(
        sourceBackbone,
        sourceTenant,
        sourceNode,
        sourceContent,
        targetBackbone,
        targetTenant,
        targetNode,
        newContentRecord,
        context,
      );

      // persist DRAFT entity out of transaction
      newContentRecord = await this.getRepository().create(newContentRecord);

      // now copy the assets
      for (const sourceAsset of sourceContent.metadata?.assets ?? []) {
        // create a copy of the asset entity without remote identifier
        const newAsset = new ContentAssetMetadata({
          ...sourceAsset,
          remoteId: undefined,
        });

        // copy the asset content
        await this.copyContentAssetInStorage(
          sourceBackbone,
          sourceTenant,
          sourceNode,
          sourceContent,
          sourceAsset,
          targetBackbone,
          targetTenant,
          targetNode,
          newContentRecord,
          newAsset,
          context,
        );
      }

      // move entity in ACTIVE status
      newContentRecord.status = ContentStatus.ACTIVE;
      await this.getRepository().update(newContentRecord, {
        transaction: context.transaction,
      });

      return newContentRecord;
    }, outerContext.transaction);
  }

  protected copyContentInStorage(
    sourceBackbone: C,
    sourceTenant: ClientTenant,
    sourceNode: StorageNode,
    sourceContent: T,
    targetBackbone: C,
    targetTenant: ClientTenant,
    targetNode: StorageNode,
    newContentRecord: T,
    context: RestContext,
  ): Promise<void> {
    throw new Error('NOT IMPLEMENTED');
  }

  protected copyContentAssetInStorage(
    sourceBackbone: C,
    sourceTenant: ClientTenant,
    sourceNode: StorageNode,
    sourceContent: T,
    sourceAsset: ContentAssetMetadata,
    targetBackbone: C,
    targetTenant: ClientTenant,
    targetNode: StorageNode,
    newContentRecord: T,
    newAsset: ContentAssetMetadata,
    context: RestContext,
  ): Promise<void> {
    throw new Error('NOT IMPLEMENTED');
  }

  protected abstract storeContentInStorage(
    backbone: C,
    tenant: ClientTenant,
    node: StorageNode,
    entity: T,
    source: ContentStreamer,
  ): Promise<void>;

  protected abstract storeAssetContentInStorage(
    backbone: C,
    tenant: ClientTenant,
    node: StorageNode,
    entity: T,
    asset: ContentWithMetadata,
    source: ContentStreamer,
  ): Promise<void>;

  protected abstract fetchContentFromStorage(
    backbone: C,
    tenant: ClientTenant,
    node: StorageNode,
    entity: T,
  ): Promise<ContentStreamer>;

  protected abstract fetchAssetContentFromStorage(
    backbone: C,
    tenant: ClientTenant,
    node: StorageNode,
    entity: T,
    asset: ContentAssetMetadata,
  ): Promise<ContentStreamer>;

  protected abstract deleteContentFromStorage(
    backbone: C,
    tenant: ClientTenant,
    node: StorageNode,
    content: T,
  ): Promise<void>;

  protected abstract deleteContentAssetFromStorage(
    backbone: C,
    tenant: ClientTenant,
    node: StorageNode,
    entity: T,
    asset: ContentAssetMetadata,
  ): Promise<void>;

  /*
   * override this method to cleanup more resources
   */
  protected async afterContentDeletion(
    backbone: C,
    tenant: ClientTenant,
    node: StorageNode,
    entity: T,
  ): Promise<void> {
    // NOP
  }
}
