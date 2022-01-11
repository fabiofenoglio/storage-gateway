import {inject, injectable, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {juggler} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {SecurityBindings} from '@loopback/security';
import fs from 'fs-extra';
import {ConfigurationBindings, ErrorBindings, LoggerBindings} from '../../key';
import {ClientTenant, StorageNode, StorageNodeType} from '../../models';
import {AbstractContent} from '../../models/content/abstract-content.model';
import {DeferredContentRetriever} from '../../models/content/content-models.model';
import {ContentStreamer} from '../../models/content/content-streamer.model';
import {
  RawUploadDto,
  SupportedHash,
  supportedHashesList,
  UploadedContent,
  UploadedContentHashes,
} from '../../models/content/content-upload-dto.model';
import {CreateContentResponse} from '../../rest/create-content/create-content-response.model';
import {ContentDto} from '../../rest/dto/content-dto.model';
import {RestContext} from '../../rest/rest-context.model';
import {UpdateContentResponse} from '../../rest/update-content/update-content-response.model';
import {Constants, SanitizationUtils} from '../../utils';
import {AppCustomConfig} from '../../utils/configuration-utils';
import {ClientProfile, SystemClient} from '../client-profile.service';
import {ErrorService} from '../error.service';
import {FilesystemContentManager} from '../filesystem/filesystem-content-manager.service';
import {MemoryContentManager} from '../in-memory/memory-content-manager.service';
import {MapperService} from '../mapper.service';
import {OnedriveContentManager} from '../onedrive/onedrive-content-manager.service';
import {S3ContentManager} from '../s3/s3-content-manager.service';
import {TransactionService} from '../transaction-manager.service';
import {
  AbstractContentManagerService,
  ContentRetrieveRequestConditions,
} from './abstract-content-manager.service';

const UPLOAD_CONTENT_TYPE_FIELD = 'contentType';
const UPLOAD_FILE_NAME_FIELD = 'fileName';
const UPLOAD_VERSION_FIELD = 'version';

@injectable()
export class ContentService {
  private registeredManagers: {
    [typeCode: string]: AbstractContentManagerService<AbstractContent>;
  } = {};

  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER) private logger: WinstonLogger,
    @inject(SecurityBindings.USER, {optional: true})
    private client: ClientProfile,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
    @service(FilesystemContentManager)
    private filesystemContentManager: FilesystemContentManager,
    @service(OnedriveContentManager)
    private onedriveContentManager: OnedriveContentManager,
    @service(MemoryContentManager)
    private memoryContentManager: MemoryContentManager,
    @service(S3ContentManager)
    private s3ContentManager: S3ContentManager,
    @service(MapperService) private mapperService: MapperService,
    @service(TransactionService) private transactionService: TransactionService,
    @inject(ErrorBindings.ERROR_SERVICE) private errorService: ErrorService,
  ) {
    [
      filesystemContentManager,
      onedriveContentManager,
      memoryContentManager,
      s3ContentManager,
    ].forEach(manager => {
      if (manager.enabled) {
        this.registeredManagers[manager.typeCode] = manager;
      }
    });
  }

  private effectiveClient(): ClientProfile {
    return this.client ?? SystemClient;
  }

  public getContentManager(
    code: string,
  ): AbstractContentManagerService<AbstractContent> {
    if (!code) {
      throw new Error('Code is required');
    }

    const registered = this.registeredManagers[code];
    if (!registered) {
      throw new Error('No content manager found for type ' + code);
    }
    return registered;
  }

  public async fetch(
    tenant: ClientTenant,
    node: StorageNode,
    key: string,
  ): Promise<AbstractContent> {
    if (!tenant || !node) {
      throw new HttpErrors.BadRequest();
    }

    const context: RestContext = {
      client: this.effectiveClient(),
    };

    // retrieve content manager
    const contentManager = this.getContentManager(tenant.backboneType);

    const entity = await contentManager.getContent(tenant, node, key, context);
    if (!entity) {
      throw new HttpErrors.NotFound();
    }

    // map to Dto and return
    return entity;
  }

  public async getContent(
    tenant: ClientTenant,
    node: StorageNode,
  ): Promise<{entity: AbstractContent; dto: ContentDto} | null> {
    if (!tenant || !node) {
      throw new HttpErrors.BadRequest();
    }

    const context: RestContext = {
      client: this.effectiveClient(),
    };

    // support only a single content at the moment
    const key = Constants.CONTENT.DEFAULT_KEY;

    // retrieve content manager
    const contentManager = this.getContentManager(tenant.backboneType);

    const entity = await contentManager.getContent(tenant, node, key, context);
    if (!entity) {
      return null;
    }

    // map to Dto and return
    return {
      entity,
      dto: this.mapperService.toContentDto(entity),
    };
  }

  private validateUploadedContent(request: RawUploadDto): UploadedContent {
    if (!request) {
      throw new HttpErrors.BadRequest();
    }

    // support only a single content at the moment
    if (request.files.length < 1) {
      throw new HttpErrors.BadRequest('No content provided');
    } else if (request.files.length > 1) {
      throw new HttpErrors.BadRequest(
        'Multiple content is not supported at the moment',
      );
    }

    const file = request.files[0];

    if (!file.originalname) {
      throw new HttpErrors.BadRequest('Filename could not be retrieved');
    }
    SanitizationUtils.sanitizeFilename(file.originalname);

    if (!file.path && !file.content?.length) {
      throw new HttpErrors.BadRequest('File content could not be localized');
    }
    if (!file.size && !file.content?.length) {
      throw new HttpErrors.BadRequest('File size could not be retrieved');
    }

    if (request.fields) {
      const contentTypeField = request.fields[UPLOAD_CONTENT_TYPE_FIELD];
      if (contentTypeField) {
        file.mimetype = contentTypeField;
      }
      const fileNameField = request.fields[UPLOAD_FILE_NAME_FIELD];
      if (fileNameField) {
        file.originalname = fileNameField;
      }
    }

    let providedHashes: UploadedContentHashes | undefined = undefined;
    for (const possibleKey of supportedHashesList) {
      if (request.fields[possibleKey]) {
        if (!providedHashes) {
          providedHashes = {};
        }
        providedHashes[possibleKey as SupportedHash] =
          request.fields[possibleKey].trim();
      }
    }

    return {
      ...file,
      originalname: file.originalname
        ? SanitizationUtils.sanitizeFilename(file.originalname)
        : undefined,
      mimetype: file.mimetype
        ? SanitizationUtils.sanitizeContentType(file.mimetype)
        : undefined,
      content: file.path
        ? ContentStreamer.fromPath(file.path)
        : ContentStreamer.fromBuffer(file.content!),
      hashes: providedHashes,
      version: request.fields[UPLOAD_VERSION_FIELD]
        ? parseInt(request.fields[UPLOAD_VERSION_FIELD], 10)
        : undefined,
    };
  }

  public async createOrUpdateContent(
    tenant: ClientTenant,
    node: StorageNode,
    uploadedContent: UploadedContent,
    outerTransaction: juggler.Transaction,
  ): Promise<{entity: AbstractContent; dto: UpdateContentResponse}> {
    if (!tenant || !node) {
      throw new HttpErrors.BadRequest();
    }

    if (!uploadedContent) {
      throw new HttpErrors.BadRequest();
    }

    // allow only on FILE nodes
    if (StorageNodeType.FILE !== node.type) {
      throw new HttpErrors.BadRequest(
        'Content creation is not allowed on ' + node.type + ' nodes',
      );
    }

    // retrieve content manager
    const contentManager = this.getContentManager(tenant.backboneType);

    // instantiate transaction
    const entity = await this.transactionService.inTransaction(
      async transaction => {
        const context: RestContext = {
          client: this.effectiveClient(),
          transaction,
        };

        const existing = await contentManager.getContent(
          tenant,
          node,
          Constants.CONTENT.DEFAULT_KEY,
          context,
        );

        // delegate content creation to specific backbone manager
        if (existing) {
          return contentManager.updateContent(
            tenant,
            node,
            Constants.CONTENT.DEFAULT_KEY,
            uploadedContent,
            context,
          );
        } else {
          return contentManager.createContent(
            tenant,
            node,
            Constants.CONTENT.DEFAULT_KEY,
            uploadedContent,
            context,
          );
        }
      },
      outerTransaction,
    );

    // map to Dto and return
    return {
      entity,
      dto: new UpdateContentResponse({
        ...this.mapperService.toContentDto(entity),
      }),
    };
  }

  public async createContent(
    tenant: ClientTenant,
    node: StorageNode,
    request?: RawUploadDto,
    uploadedContent?: UploadedContent,
    outerTransaction?: juggler.Transaction,
  ): Promise<{entity: AbstractContent; dto: CreateContentResponse}> {
    if (!tenant || !node) {
      throw new HttpErrors.BadRequest();
    }

    if (!uploadedContent) {
      if (!request) {
        throw new HttpErrors.BadRequest();
      }
      uploadedContent = this.validateUploadedContent(request);
    }
    if (!uploadedContent) {
      throw new HttpErrors.BadRequest();
    }

    // allow only on FILE nodes
    if (StorageNodeType.FILE !== node.type) {
      throw new HttpErrors.BadRequest(
        'Content creation is not allowed on ' + node.type + ' nodes',
      );
    }

    // retrieve content manager
    const contentManager = this.getContentManager(tenant.backboneType);

    // instantiate transaction
    const entity = await this.transactionService.inTransaction(
      async transaction => {
        const context: RestContext = {
          client: this.effectiveClient(),
          transaction,
        };

        // delegate content creation to specific backbone manager
        return contentManager.createContent(
          tenant,
          node,
          Constants.CONTENT.DEFAULT_KEY,
          uploadedContent!,
          context,
        );
      },
      outerTransaction,
    );

    // map to Dto and return
    return {
      entity,
      dto: new CreateContentResponse({
        ...this.mapperService.toContentDto(entity),
      }),
    };
  }

  public async updateContent(
    tenant: ClientTenant,
    node: StorageNode,
    request?: RawUploadDto,
    uploadedContent?: UploadedContent,
    outerTransaction?: juggler.Transaction,
  ): Promise<{entity: AbstractContent; dto: UpdateContentResponse}> {
    if (!tenant || !node) {
      throw new HttpErrors.BadRequest();
    }

    if (!uploadedContent) {
      if (!request) {
        throw new HttpErrors.BadRequest();
      }
      uploadedContent = this.validateUploadedContent(request);
    }
    if (!uploadedContent) {
      throw new HttpErrors.BadRequest();
    }

    // allow only on FILE nodes
    if (StorageNodeType.FILE !== node.type) {
      throw new HttpErrors.BadRequest(
        'Content update is not allowed on ' + node.type + ' nodes',
      );
    }

    // support only a single content at the moment
    const key = Constants.CONTENT.DEFAULT_KEY;

    // retrieve content manager
    const contentManager = this.getContentManager(tenant.backboneType);

    // instantiate transaction
    const entity = await this.transactionService.inTransaction(
      async transaction => {
        const context: RestContext = {
          client: this.effectiveClient(),
          transaction,
        };

        // delegate content creation to specific backbone manager
        return contentManager.updateContent(
          tenant,
          node,
          key,
          uploadedContent!,
          context,
        );
      },
      outerTransaction,
    );

    // map to Dto and return
    return {
      entity,
      dto: new UpdateContentResponse({
        ...this.mapperService.toContentDto(entity),
      }),
    };
  }

  public async deleteContent(
    tenant: ClientTenant,
    node: StorageNode,
  ): Promise<void> {
    if (!tenant || !node) {
      throw new HttpErrors.BadRequest();
    }

    // allow only on FILE nodes
    if (StorageNodeType.FILE !== node.type) {
      throw new HttpErrors.BadRequest(
        'Content deletion is not allowed on ' + node.type + ' nodes',
      );
    }

    // support only a single content at the moment
    const key = Constants.CONTENT.DEFAULT_KEY;

    const context: RestContext = {
      client: this.effectiveClient(),
    };

    // retrieve content manager
    const contentManager = this.getContentManager(tenant.backboneType);

    // delegate content deletion to specific backbone manager
    await contentManager.deleteContent(tenant, node, key, context);
  }

  public async retrieveContent(
    tenant: ClientTenant,
    node: StorageNode,
    conditions?: ContentRetrieveRequestConditions,
  ): Promise<DeferredContentRetriever> {
    if (!tenant || !node) {
      throw new HttpErrors.BadRequest();
    }

    if (node.type !== StorageNodeType.FILE) {
      throw new HttpErrors.BadRequest(
        'Cannot retrieve content on ' + node.type + ' node',
      );
    }

    // support only a single content at the moment
    const key = Constants.CONTENT.DEFAULT_KEY;

    const context: RestContext = {
      client: this.effectiveClient(),
    };

    // retrieve content manager
    const contentManager = this.getContentManager(tenant.backboneType);

    // delegate content retrieval to specific backbone manager
    return contentManager.retrieveContent(tenant, node, key, context);
  }

  public async retrieveContentAsset(
    tenant: ClientTenant,
    node: StorageNode,
    assetKey: string,
    conditions?: ContentRetrieveRequestConditions,
  ): Promise<DeferredContentRetriever> {
    if (!tenant || !node) {
      throw new HttpErrors.BadRequest();
    }

    if (node.type !== StorageNodeType.FILE) {
      throw new HttpErrors.BadRequest(
        'Cannot retrieve content asset on ' + node.type + ' node',
      );
    }

    assetKey = SanitizationUtils.sanitizeContentAssetKey(assetKey);

    // support only a single content at the moment
    const key = Constants.CONTENT.DEFAULT_KEY;

    const context: RestContext = {
      client: this.effectiveClient(),
    };

    // retrieve content manager
    const contentManager = this.getContentManager(tenant.backboneType);

    // delegate content creation to specific backbone manager
    return contentManager.retrieveContentAsset(
      tenant,
      node,
      key,
      assetKey,
      context,
    );
  }

  public async deleteAllContent(
    tenant: ClientTenant,
    node: StorageNode,
  ): Promise<void> {
    if (!tenant || !node) {
      throw new HttpErrors.BadRequest();
    }

    // support only a single content at the moment
    const key = Constants.CONTENT.DEFAULT_KEY;

    const context: RestContext = {
      client: this.effectiveClient(),
    };

    // retrieve content manager
    const contentManager = this.getContentManager(tenant.backboneType);

    // delegate content deletion to specific backbone manager
    return contentManager.deleteContent(tenant, node, key, context);
  }

  public async batchDelete(
    tenant: ClientTenant,
    nodes: StorageNode[],
    transaction: juggler.Transaction | undefined = undefined,
  ): Promise<void> {
    if (!tenant?.id) {
      throw new HttpErrors.BadRequest();
    }
    if (!nodes?.length) {
      return;
    }

    // support only a single content at the moment
    const key = Constants.CONTENT.DEFAULT_KEY;

    const context: RestContext = {
      client: this.effectiveClient(),
      transaction,
    };

    // retrieve content manager
    const contentManager = this.getContentManager(tenant.backboneType);

    // delete all contents in same transaction

    // delegate content deletion to specific backbone manager
    this.logger.debug(
      'attempting batch content delete for ' + nodes.length + ' nodes',
    );

    for (const node of nodes) {
      this.logger.debug('attempting content delete for node ' + node.uuid);
      await contentManager.deleteContent(tenant, node, key, context);
      this.logger.verbose('deleted content for node ' + node.uuid);
    }

    this.logger.verbose(
      'finished batch content delete for ' + nodes.length + ' nodes',
    );
  }

  public async copyContent(
    sourceTenant: ClientTenant,
    sourceNode: StorageNode,
    targetTenant: ClientTenant,
    targetNode: StorageNode,
    outerTransaction: juggler.Transaction,
  ): Promise<{
    entity: AbstractContent;
    dto: CreateContentResponse;
  }> {
    const key = Constants.CONTENT.DEFAULT_KEY;

    const mapResult = (entity: AbstractContent) => {
      // map to Dto and return
      return {
        entity,
        dto: new CreateContentResponse({
          ...this.mapperService.toContentDto(entity),
        }),
      };
    };

    const newEntity = await this.transactionService.inTransaction(
      async transaction => {
        const context: RestContext = {
          client: this.effectiveClient(),
          transaction,
        };

        // require same backbone and same content policy
        if (
          sourceTenant.backboneType === targetTenant.backboneType &&
          sourceTenant.backboneId === targetTenant.backboneId &&
          sourceTenant.encryptionAlgorithm ===
            targetTenant.encryptionAlgorithm &&
          sourceTenant.enableThumbnails === targetTenant.enableThumbnails
        ) {
          // same backbone, maybe can direct copy

          // retrieve content manager
          const contentManager = this.getContentManager(
            sourceTenant.backboneType,
          );

          const sameBackboneCopyResult = await contentManager.copyContent(
            sourceTenant,
            sourceNode,
            targetTenant,
            targetNode,
            context,
          );

          if (sameBackboneCopyResult) {
            return sameBackboneCopyResult;
          }
        }

        // copy the content manually (requires data transfer)
        const sourceContentManager = this.getContentManager(
          sourceTenant.backboneType,
        );

        // retrieve the source content
        const sourceContentRecord = await sourceContentManager.getContent(
          sourceTenant,
          sourceNode,
          key,
          context,
        );
        if (!sourceContentRecord) {
          throw new HttpErrors.NotFound('Source content not found');
        }

        const sourcePhysicalContent =
          await sourceContentManager.retrieveContent(
            sourceTenant,
            sourceNode,
            key,
            context,
          );

        const uploadedContentHashes: UploadedContentHashes = {};
        if (sourceContentRecord.metadata?.hashes?.sha256) {
          uploadedContentHashes.sha256 =
            sourceContentRecord.metadata.hashes.sha256;
        } else if (sourceContentRecord.metadata?.hashes?.sha1) {
          uploadedContentHashes.sha1 = sourceContentRecord.metadata.hashes.sha1;
        } else if (sourceContentRecord.metadata?.hashes?.md5) {
          uploadedContentHashes.md5 = sourceContentRecord.metadata.hashes.md5;
        }

        const uploadedContent: UploadedContent = {
          content: await sourcePhysicalContent.contentProvider(),
          originalname: sourceContentRecord.originalName,
          encoding: sourceContentRecord.encoding,
          mimetype: sourceContentRecord.mimeType,
          size: sourceContentRecord.contentSize!,
          filename: sourceContentRecord.originalName,
          version: sourceContentRecord.version,
          hashes: uploadedContentHashes,
        };

        // create the new content
        const r = await this.createOrUpdateContent(
          targetTenant,
          targetNode,
          uploadedContent,
          transaction,
        );

        return r.entity;
      },
      outerTransaction,
    );

    return mapResult(newEntity);
  }

  public async cleanup(request: RawUploadDto): Promise<void> {
    for (const file of request.files ?? []) {
      if (file.path) {
        this.logger.verbose(
          'cleaning up temporary uploaded content at ' + file.path,
        );

        try {
          await fs.remove(file.path);
        } catch (err) {
          this.logger.warn('Error cleaning up uploaded content', err);
          await this.errorService.reportError(
            'Error cleaning up uploaded content',
            {
              file: {
                ...file,
                buffer: null,
              },
              error: err,
            },
          );
        }
      }
    }
  }
}
