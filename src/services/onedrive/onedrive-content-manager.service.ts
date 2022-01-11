import {inject, injectable, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {
  Client,
  GraphError,
  LargeFileUploadTask,
  ResponseType,
} from '@microsoft/microsoft-graph-client';
import * as MicrosoftGraph from '@microsoft/microsoft-graph-types';
import {Readable} from 'stream';
import {v4 as uuidv4} from 'uuid';
import {ConfigurationBindings, LoggerBindings} from '../../key';
import {
  ClientTenant,
  ClientTenantBackbone,
  ContentMetadata,
  OnedriveBackboneTenant,
  OnedriveContent,
  StorageNode,
} from '../../models';
import {ContentAssetMetadata} from '../../models/content/content-asset-metadata.model';
import {ContentMetadataHashes} from '../../models/content/content-metadata-hashes.model';
import {ContentMetadataImageThumbnail} from '../../models/content/content-metadata-image-thumbnail.model';
import {ContentMetadataImage} from '../../models/content/content-metadata-image.model';
import {ContentMetadataVideo} from '../../models/content/content-metadata-video.model';
import {ContentWithMetadata} from '../../models/content/content-models.model';
import {ContentStreamer} from '../../models/content/content-streamer.model';
import {
  SupportedHash,
  UploadedContent,
} from '../../models/content/content-upload-dto.model';
import {
  ClientTenantRepository,
  OnedriveContentRepository,
  PaginationRepository,
  StorageNodeRepository,
} from '../../repositories';
import {RestContext} from '../../rest/rest-context.model';
import {ObjectUtils, PathUtils, RequestUtils, retry} from '../../utils';
import {AppCustomConfig} from '../../utils/configuration-utils';
import {SanitizationUtils} from '../../utils/sanitization-utils';
import {StreamUtils} from '../../utils/stream-utils';
import {AbstractBackboneManagerService} from '../content/abstract-backbone-manager.service';
import {AbstractContentManagerService} from '../content/abstract-content-manager.service';
import {ContentProcessorService} from '../content/content-processor.service';
import {UnmanagedContentManagerService} from '../content/unmanaged-content-manager.service';
import {MetricService} from '../metric.service';
import {LargeFileUploadStreamTask} from './large-file-upload-task-stream.task';
import {MsGraphTokenService} from './msgraph-token.service';
import {OnedriveBackboneManager} from './onedrive-backbone-manager.service';

@injectable()
export class OnedriveContentManager extends UnmanagedContentManagerService<
  OnedriveContent,
  OnedriveBackboneTenant
> {
  CHUNCKED_UPLOAD_TRESHOLD = 2 * 1024 * 1024;

  constructor(
    @inject(LoggerBindings.ONEDRIVE_LOGGER) private logger: WinstonLogger,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
    @repository(OnedriveContentRepository)
    private contentRepository: OnedriveContentRepository,
    @repository(ClientTenantRepository)
    private tenantRepository: ClientTenantRepository,
    @repository(StorageNodeRepository)
    private storageNodeRepository: StorageNodeRepository,
    @service(MsGraphTokenService)
    private msGraphTokenService: MsGraphTokenService,
    @service(OnedriveBackboneManager)
    private onedriveBackboneManager: OnedriveBackboneManager,
    @service(ContentProcessorService)
    private contentProcessorService: ContentProcessorService,
    @service(MetricService)
    private metricService: MetricService,
  ) {
    super(logger);
  }

  public get typeCode(): string {
    return ClientTenantBackbone.ONEDRIVE;
  }

  public get enabled(): boolean {
    return !!this.configuration.onedrive.enable;
  }

  protected isUnmanaged(tenant: ClientTenant) {
    // if encryption is enabled the tenant is unmanaged
    if (tenant.encryptionAlgorithm) {
      return true;
    }

    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected getRepository(): PaginationRepository<OnedriveContent, any, any> {
    return this.contentRepository;
  }

  protected getBackboneManager(): AbstractBackboneManagerService<OnedriveBackboneTenant> {
    return this.onedriveBackboneManager;
  }

  protected async storeContentInStorage(
    backbone: OnedriveBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: OnedriveContent,
    source: ContentStreamer,
  ): Promise<void> {
    // compute storage path
    const storagePath = await this.computeStoragePath(tenant, node, entity);
    entity.onedrivePath = storagePath.path;

    // create folder if missing
    const {client} = await this.getOnedriveClient(tenant);
    const parentFolder = await this.createFolderIfMissing(
      client,
      storagePath.driveId,
      storagePath.path,
      {
        createOrReuse: true,
      },
    );

    // upload content to OneDrive
    this.logger.debug(
      `uploading new content ${entity.key} - ${entity.uuid} to onedrive at path ${storagePath.path}`,
    );

    const uploadResult = await this.uploadToOnedrive(
      client,
      {
        size: ObjectUtils.require(entity, 'contentSize'),
        mimetype: ObjectUtils.require(entity, 'mimeType'),
        content: source,
      },
      {
        driveId: storagePath.driveId,
        parentId: this.getOrError(parentFolder, 'id'),
        fileName: entity.uuid + '_' + entity.originalName,
      },
      {
        forceChunkedTransfer: false,
      },
    );

    // patch local record
    this.patchRecordWithOnedriveMetadata(entity, uploadResult);
  }

  protected async storeAssetContentInStorage(
    backbone: OnedriveBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: OnedriveContent,
    asset: ContentWithMetadata,
    source: ContentStreamer,
  ): Promise<void> {
    const {client} = await this.getOnedriveClient(tenant);

    const storagePath = await this.computeStoragePath(tenant, node, entity);

    const parentFolder = await this.createFolderIfMissing(
      client,
      storagePath.driveId,
      storagePath.path,
      {
        createOrReuse: true,
      },
    );

    this._logger.verbose(
      'storing asset ' + asset.key + ' on onedrive at path ' + storagePath.path,
    );

    const uploadResult = await this.uploadToOnedriveSmallFile(
      client,
      {
        content: source,
        mimetype: 'application/octet-stream',
      },
      {
        driveId: storagePath.driveId,
        parentId: this.getOrError(parentFolder, 'id'),
        fileName: entity.uuid + '_asset_' + asset.key,
      },
    );

    asset.contentETag = uploadResult.eTag ?? asset.contentETag;
    asset.remoteId = uploadResult.id;

    this._logger.verbose(
      'stored asset ' + asset.key + ' on onedrive at ' + storagePath.path,
    );
  }

  protected async fetchContentFromStorage(
    backbone: OnedriveBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: OnedriveContent,
  ): Promise<ContentStreamer> {
    // check if content needs refresh
    await this.checkPendingRefresh(tenant, node, entity);

    // GET item from onedrive
    const {client} = await this.getOnedriveClient(tenant);

    // retrieves a ContentStreamer from URL
    return this.fetchRemoteContent(client, backbone.driveId, entity.onedriveId);
  }

  protected async fetchAssetContentFromStorage(
    backbone: OnedriveBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: OnedriveContent,
    asset: ContentAssetMetadata,
  ): Promise<ContentStreamer> {
    if (!this.isUnmanaged(tenant)) {
      return this.retrieveContentAssetOnedriveNative(
        tenant,
        node,
        asset.key,
        entity,
      );
    }

    // GET item from onedrive
    const {client} = await this.getOnedriveClient(tenant);

    // retrieves a ContentStreamer
    return this.fetchRemoteContent(
      client,
      backbone.driveId,
      this.getOrError(asset, 'remoteId'),
    );
  }

  protected async deleteContentFromStorage(
    backbone: OnedriveBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    content: OnedriveContent,
  ): Promise<void> {
    // GET item from onedrive
    const {client} = await this.getOnedriveClient(tenant);

    await this.deleteRemoteItem(client, backbone.driveId, content.onedriveId);
  }

  protected async deleteContentAssetFromStorage(
    backbone: OnedriveBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: OnedriveContent,
    asset: ContentAssetMetadata,
  ): Promise<void> {
    if (!this.isUnmanaged(tenant)) {
      return;
    }

    // GET item from onedrive
    const {client} = await this.getOnedriveClient(tenant);

    await this.deleteRemoteItem(
      client,
      backbone.driveId,
      ObjectUtils.require(asset, 'remoteId'),
    );
  }

  protected async afterContentDeletion(
    backbone: OnedriveBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: OnedriveContent,
  ) {
    // @override
    ObjectUtils.notNull(super.afterContentDeletion);

    // TODO - cleanup resource folder
  }

  private patchRecordWithOnedriveMetadata(
    entity: OnedriveContent,
    data: MicrosoftGraph.DriveItem,
  ) {
    entity.onedriveItem = data;
    entity.onedriveId = this.getOrError(data, 'id');
    entity.onedriveCTag = this.getOrError(data, 'cTag');
    entity.onedriveETag = this.getOrError(data, 'eTag');
  }

  async getContent(
    tenant: ClientTenant,
    node: StorageNode,
    key: string,
    context: RestContext,
  ): Promise<OnedriveContent | null> {
    // @override
    ObjectUtils.notNull(super.getContent);

    const entity = await super.getContent(tenant, node, key, context);

    if (entity) {
      // check if content needs refresh
      await this.checkPendingRefresh(tenant, node, entity);
    }

    return entity;
  }

  protected async fetchMetadata(
    backbone: OnedriveBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    content: OnedriveContent,
    contentSource: UploadedContent,
  ): Promise<ContentMetadata> {
    // @override
    ObjectUtils.notNull(super.fetchMetadata);

    if (this.isUnmanaged(tenant)) {
      return super.fetchMetadata(
        backbone,
        tenant,
        node,
        content,
        contentSource,
      );
    }

    const onedriveItem = content.onedriveItem as MicrosoftGraph.DriveItem;

    return this.fetchMetadataFromOnedriveNative(contentSource, onedriveItem);
  }

  private async deleteRemoteItem(
    client: Client,
    driveId: string,
    itemId: string,
  ): Promise<boolean> {
    // delete orphan content
    try {
      this.logger.debug(`removing content ${driveId}/${itemId}`);
      await this.deleteItem(client, driveId, itemId);
      this.logger.verbose(`removed content ${driveId}/${itemId}`);
      return true;
    } catch (err) {
      this.logger.error(`error removing content ${driveId}/${itemId}`);
      throw err;
    }
  }

  public async uploadToOnedrive(
    client: Client,
    source: {
      content: ContentStreamer;
      size: number;
      mimetype?: string;
    },
    target: {
      driveId: string;
      parentId: string;
      fileName: string;
    },
    options?: {
      forceChunkedTransfer?: boolean;
      rangeSize?: number;
    },
  ): Promise<MicrosoftGraph.DriveItem> {
    if (
      !options?.forceChunkedTransfer &&
      source.size < this.CHUNCKED_UPLOAD_TRESHOLD
    ) {
      return this.uploadToOnedriveSmallFile(client, source, target);
    } else {
      return this.uploadToOnedriveLargeFile(client, source, target, options);
    }
  }

  public async uploadToOnedriveSmallFile(
    client: Client,
    source: {
      content: ContentStreamer;
      mimetype?: string;
    },
    target: {
      driveId: string;
      parentId: string;
      fileName: string;
    },
  ): Promise<MicrosoftGraph.DriveItem> {
    target.fileName = SanitizationUtils.sanitizeFilename(target.fileName);

    // direct upload
    const targetUrl =
      OnedriveContentManager.buildOnedrivePathForItem(
        target.driveId,
        target.parentId,
      ) +
      ':/' +
      encodeURIComponent(target.fileName) +
      ':/content';

    this.metricService.registerExternalWriteWithData();
    return (await client
      .api(targetUrl)
      .header('Content-Type', source.mimetype ?? 'application/octet-stream')
      .putStream(await source.content.stream())) as MicrosoftGraph.DriveItem;
  }

  public async uploadToOnedriveLargeFile(
    client: Client,
    source: {
      content: ContentStreamer;
      size: number;
    },
    target: {
      driveId: string;
      parentId: string;
      fileName: string;
    },
    options?: {
      rangeSize?: number;
    },
  ): Promise<MicrosoftGraph.DriveItem> {
    target.fileName = SanitizationUtils.sanitizeFilename(target.fileName);

    // chunked large-file upload
    const targetUrl =
      OnedriveContentManager.buildOnedrivePathForItem(
        target.driveId,
        target.parentId,
      ) +
      ':/' +
      encodeURIComponent(target.fileName) +
      ':/createUploadSession';

    const payload = {
      item: {
        '@microsoft.graph.conflictBehavior': 'fail',
        name: target.fileName,
      },
    };

    if (this.logger.isDebugEnabled()) {
      this.logger.debug('creating upload session with data', {
        url: targetUrl,
        ...payload,
      });
    }

    this.metricService.registerExternalWrite();
    const largeFileUploadSession =
      await LargeFileUploadTask.createUploadSession(client, targetUrl, payload);

    this.logger.verbose('created upload session ' + largeFileUploadSession.url);

    const fileObject = {
      size: source.size,
      contentStream: await source.content.stream(),
      name: target.fileName,
    };

    const uploadTask = new LargeFileUploadStreamTask(
      this.logger,
      client,
      fileObject,
      largeFileUploadSession,
      {
        rangeSize: options?.rangeSize ?? undefined,
      },
    );

    this.metricService.registerExternalWriteWithData();
    return uploadTask.upload();
  }

  private async fetchRemoteContent(
    client: Client,
    driveId: string,
    itemId: string,
  ): Promise<ContentStreamer> {
    const itemUrl = OnedriveContentManager.buildOnedrivePathForItem(
      ObjectUtils.requireNotNull(driveId),
      ObjectUtils.requireNotNull(itemId),
    );
    let remoteItem: MicrosoftGraph.DriveItem | null = null;
    let downloadUrl: string | null;

    this.logger.verbose('fetching remote element content by ref ' + itemUrl);
    try {
      // execute GET call with auto retry
      const rawResult = await retry(
        async () => {
          this.metricService.registerExternalRead();
          return client
            .api(itemUrl)
            .query({
              $select: '@microsoft.graph.downloadUrl',
            })
            .get();
        },
        {
          logger: this.logger,
          description: 'fetching remote content from OneDrive',
          // with these settings takes approx. 4600 ms to fail 5 retries
          interval: 250,
          maxRetries: 5,
          linearBackoff: 0.75,
          exponentialBackoff: 1.4,
          canRetry: err => {
            if ((err as GraphError)?.statusCode) {
              const status = (err as GraphError).statusCode;
              if (status && status >= 300 && status < 500) {
                // 3xx and 4xx errors should not be retried
                return false;
              }
            }
            // retry for all other errors
            return true;
          },
        },
      );

      remoteItem = rawResult as MicrosoftGraph.DriveItem;
      downloadUrl = rawResult['@microsoft.graph.downloadUrl'];

      if (this.logger.isDebugEnabled()) {
        this.logger.debug(
          'found remote element content by ref ' + itemUrl + ' => ',
          remoteItem,
        );
      }

      if (!downloadUrl?.length) {
        throw new HttpErrors.InternalServerError(
          'Content is not retrievable at the moment',
        );
      }

      return ContentStreamer.fromURL(downloadUrl);
    } catch (err) {
      if (err?.code === 'itemNotFound') {
        this.logger.debug(
          'remote item content at ref ' + itemUrl + ' does not exist',
        );
        throw new HttpErrors.NotFound('Item content not found on backbone');
      }
      this.logger.error(
        'error fetching remote item content by ref ' + itemUrl,
        err,
      );
      throw err;
    }
  }

  private async checkPendingRefresh(
    tenant: ClientTenant,
    node: StorageNode,
    entity: OnedriveContent,
  ): Promise<OnedriveContent> {
    // skip if encryption is enabled
    if (entity.encryption?.alg) {
      return entity;
    }

    // check if content needs refresh
    const onedriveItemCached = entity.onedriveItem as MicrosoftGraph.DriveItem;
    if (onedriveItemCached?.file?.processingMetadata === true) {
      this.logger.debug(
        'remote item ' +
          entity.onedriveId +
          ' local copy is marked as processing metadata. Fetching to check processing status',
      );
      // needs refresh
      const {client, backbone} = await this.getOnedriveClient(tenant);
      try {
        const refreshed = await this.getItem(client, backbone.driveId, {
          id: entity.onedriveId,
        });
        if (!refreshed) {
          throw new HttpErrors.NotFound(
            'Remote item not found for specified content',
          );
        }

        if (!refreshed.file?.processingMetadata) {
          this.logger.verbose(
            'remote item ' +
              entity.onedriveId +
              ' finished processing metadata. Updating local copy',
          );

          // patch local record
          this.patchRecordWithOnedriveMetadata(entity, refreshed);

          // analyze content for metadata
          const metadata = await this.fetchMetadataFromOnedriveNative(
            null,
            refreshed,
          );
          entity.metadata = metadata;

          // update audit fields
          // entity.version = (entity.version ?? 0) + 1;
          // entity.modifiedBy = 'SYSTEM';
          // entity.modifiedAt = new Date();

          // update entity
          await this.contentRepository.update(entity);
        }
      } catch (err) {
        this.logger.error('error refreshing content with processing metadata');
        throw err;
      }
    }

    return entity;
  }

  private async retrieveContentAssetOnedriveNative(
    tenant: ClientTenant,
    node: StorageNode,
    assetKey: string,
    content: OnedriveContent,
  ): Promise<ContentStreamer> {
    this.metricService.registerExternalReadWithData();

    const splitted = assetKey.split('.');

    const {client, backbone} = await this.getOnedriveClient(tenant);

    const thumbnailContentUrl =
      OnedriveContentManager.buildOnedrivePathForItem(
        backbone.driveId,
        content.onedriveId,
      ) +
      '/thumbnails/' +
      encodeURIComponent(splitted[1]) +
      '/' +
      encodeURIComponent(splitted[2]) +
      '/content';

    return ContentStreamer.fromStreamProvider(async range => {
      const thumbContentResponse = await retry(
        async () => {
          return (await client
            .api(thumbnailContentUrl)
            .responseType(ResponseType.STREAM)
            .get()) as Readable;
        },
        {
          logger: this.logger,
          description: 'fetching remote asset content from OneDrive',
          // with these settings takes approx. 4600 ms to fail 5 retries
          interval: 250,
          maxRetries: 5,
          linearBackoff: 0.75,
          exponentialBackoff: 1.4,
          canRetry: err => {
            if ((err as GraphError)?.statusCode) {
              const status = (err as GraphError).statusCode;
              if (status && status >= 300 && status < 500) {
                // 3xx and 4xx errors should not be retried
                return false;
              }
            }
            // retry for all other errors
            return true;
          },
        },
      );

      // execute GET call with auto retry
      if (range) {
        return StreamUtils.pipeWithErrors(
          thumbContentResponse,
          StreamUtils.substream(range[0], range[1]),
        );
      }
      return thumbContentResponse;
    });
  }

  public async computeStoragePath(
    tenant: ClientTenant,
    node?: StorageNode,
    contentData?: OnedriveContent,
  ): Promise<{driveId: string; path: string}> {
    // fetch backbone
    const backBone = await this.onedriveBackboneManager.findById(
      tenant.backboneId,
    );
    if (!backBone) {
      throw new Error('Backbone is missing');
    }
    if (contentData?.uuid && !node?.uuid) {
      throw new Error('Node UUID is missing');
    }
    if (!contentData?.uuid && node?.uuid) {
      throw new Error('ContentData UUID is missing');
    }

    const p =
      SanitizationUtils.stripSlashes(this.configuration.onedrive.rootFolder) +
      '/' +
      SanitizationUtils.stripSlashes(backBone.rootLocation) +
      '/tenant-' +
      SanitizationUtils.stripSlashes(this.sanitizeTenantCode(tenant.code)) +
      (contentData?.uuid
        ? '/' +
          contentData.uuid.substr(contentData.uuid.length - 2) +
          '/node-' +
          node?.uuid
        : '');

    return {
      driveId: backBone.driveId,
      path: PathUtils.cleanPath(p),
    };
  }

  public async createFolderIfMissing(
    client: Client,
    driveId: string,
    path: string,
    options?: {
      createOrReuse?: boolean;
      findOrCreate?: boolean;
    },
  ): Promise<MicrosoftGraph.DriveItem> {
    if (!driveId?.length || !path?.length) {
      throw new Error('missing parameters');
    }

    this.logger.verbose(
      'checking existence for remote folder ' + path + ' in drive ' + driveId,
    );
    if (this.logger.isDebugEnabled()) {
      this.logger.debug('using existence check policy', options);
    }

    const d = SanitizationUtils.stripSlashes(PathUtils.cleanPath(path));
    const tokens = d.split('/').filter(o => !!o);
    if (!tokens.length) {
      throw new Error('Cannot create root folder');
    }

    if (options?.createOrReuse) {
      // CREATE OR REUSE
      // attempt creation first, reuse if existing (conflict)
      const actualPath = tokens.slice(0, tokens.length - 1).join('/');
      const nameToCreate = tokens[tokens.length - 1];
      this.logger.verbose(
        'creating remote path ' +
          actualPath +
          '/' +
          nameToCreate +
          ' because it was missing',
      );
      let currentItem: MicrosoftGraph.DriveItem | null = null;
      currentItem = await this.createFolder(
        client,
        driveId,
        actualPath?.length ? actualPath : '/',
        nameToCreate,
      );
      return currentItem;
    } else {
      // FIND OR CREATE is default
      // find first, if missing create. default when not specified
      const policy = 'find-or-create';
      let currentItem: MicrosoftGraph.DriveItem | null = null;

      const candidatePath = tokens.join('/');
      this.logger.debug(
        'checking for path ' + candidatePath + ' with ' + policy + ' policy',
      );
      currentItem = await this.getItem(client, driveId, candidatePath);

      // must create
      if (!currentItem) {
        const actualPath = tokens.slice(0, tokens.length - 1).join('/');
        const nameToCreate = tokens[tokens.length - 1];
        this.logger.verbose(
          'creating remote path ' +
            actualPath +
            '/' +
            nameToCreate +
            ' because it was missing',
        );
        currentItem = await this.createFolder(
          client,
          driveId,
          actualPath?.length ? actualPath : '/',
          nameToCreate,
        );
      }

      return currentItem;
    }
  }

  public async createFolder(
    client: Client,
    driveId: string,
    parentPath: string,
    name: string,
  ): Promise<MicrosoftGraph.DriveItem> {
    const parentIsRoot = !SanitizationUtils.stripSlashes(
      PathUtils.cleanPath(parentPath),
    ).length;
    const remotePath =
      OnedriveContentManager.buildOnedrivePath(driveId, parentPath) +
      (parentIsRoot ? '/children' : ':/children');

    const payload = {
      name: name,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    };

    this.logger.verbose(
      'creating remote folder by path ' + remotePath + ' with name ' + name,
    );

    try {
      this.metricService.registerExternalWrite();
      const response = (await client
        .api(remotePath)
        .post(payload)) as MicrosoftGraph.DriveItem;

      if (this.logger.isDebugEnabled()) {
        this.logger.debug(
          'created remote folder by path ' + remotePath + ' => ',
          response,
        );
      }

      this.logger.debug(
        'created remote path ' + remotePath + ' with id ' + response.id,
      );
      return response;
    } catch (err) {
      if (err?.code === 'nameAlreadyExists') {
        // GET and check if it is a folder
        const remotePathCandidate = PathUtils.cleanPath(
          parentPath + '/' + name,
        );
        const candidate = await this.getItem(
          client,
          driveId,
          remotePathCandidate,
        );
        if (candidate) {
          if (candidate.folder) {
            this.logger.verbose(
              'folder with remote path ' +
                remotePathCandidate +
                ' could not be created because it exists already',
            );
            return candidate;
          } else {
            this.logger.error(
              'folder with remote path ' +
                remotePathCandidate +
                ' could not be created because a file with the same name exists already',
            );
          }
        }
      }
      this.logger.error(
        'error creating remote folder by path ' + remotePath,
        err,
      );
      throw err;
    }
  }

  private async getItem(
    client: Client,
    driveId: string,
    path: string | {id: string},
  ): Promise<MicrosoftGraph.DriveItem | null> {
    if (!driveId || !path) {
      throw new Error('missing parameters');
    }
    const remotePath =
      typeof path === 'string'
        ? OnedriveContentManager.buildOnedrivePath(driveId, path)
        : OnedriveContentManager.buildOnedrivePathForItem(driveId, path.id);

    this.logger.verbose('fetching remote element by ref ' + remotePath);

    try {
      // execute GET call with auto retry
      const rawResponse = await retry(
        async () => {
          return this.getRemoteItemOrNull(client, remotePath);
        },
        {
          logger: this.logger,
          description: 'fetching remote item from OneDrive',
          // with these settings takes approx. 4600 ms to fail 5 retries
          interval: 250,
          maxRetries: 5,
          linearBackoff: 0.75,
          exponentialBackoff: 1.4,
          canRetry: err => {
            if ((err as GraphError)?.statusCode) {
              const status = (err as GraphError).statusCode;
              if (status && status >= 300 && status < 500) {
                // 3xx and 4xx errors should not be retried
                return false;
              }
            }
            // retry for all other errors
            return true;
          },
        },
      );

      if (this.logger.isDebugEnabled() && rawResponse) {
        this.logger.debug(
          'found remote element by ref ' + remotePath + ' => ',
          rawResponse,
        );
      }

      return rawResponse ?? null;
    } catch (err) {
      this.logger.error('error fetching remote item by ref ' + remotePath, err);
      throw err;
    }
  }

  private async getRemoteItemOrNull(
    client: Client,
    remotePath: string,
  ): Promise<MicrosoftGraph.DriveItem | null> {
    this.metricService.registerExternalRead();
    try {
      this.logger.debug(`attempting to get remote item ${remotePath}`);
      return (await client
        .api(remotePath)
        .expand('thumbnails')
        .get()) as MicrosoftGraph.DriveItem;
    } catch (err) {
      if (err?.code === 'itemNotFound') {
        this.logger.debug(
          `attempting to get remote item ${remotePath} failed because the item does not exist`,
        );
        return null;
      }
      throw err;
    }
  }

  public async deleteItem(
    client: Client,
    driveId: string,
    itemId: string,
  ): Promise<void> {
    if (!driveId || !itemId) {
      throw new Error('missing parameters');
    }

    const url = OnedriveContentManager.buildOnedrivePathForItem(
      driveId,
      itemId,
    );
    this.logger.verbose('deleting remote item ' + itemId);
    try {
      this.metricService.registerExternalWrite();
      await client.api(url).delete();
      this.logger.debug('deleted remote item ' + itemId);
    } catch (err) {
      if (err?.code === 'itemNotFound') {
        this.logger.warn(
          'remote item at path ' +
            itemId +
            " can't be deleted because it does not exist",
        );
        return;
      }
      this.logger.error('error deleting remote item ' + itemId, err);
    }
  }

  private async fetchMetadataFromOnedriveNative(
    contentSource: UploadedContent | null,
    onedriveItem: MicrosoftGraph.DriveItem,
  ): Promise<ContentMetadata> {
    const assets: ContentAssetMetadata[] = [];
    const thumbnails: ContentMetadataImageThumbnail[] = [];
    const processed = new ContentMetadata({
      facets: [],
      engineVersion: this.engineVersion,
      processedAt: new Date(),
      assets,
      ready: !onedriveItem?.file?.processingMetadata,
      contentETag: onedriveItem.eTag ?? undefined,
      hashes: new ContentMetadataHashes({}),
    });

    const requiredHashes = contentSource
      ? this.contentProcessorService.checkRequiredHashTypes(contentSource)
      : null;

    if (onedriveItem.file?.hashes) {
      if (onedriveItem.file.hashes.sha1Hash) {
        processed.hashes!.sha1 =
          onedriveItem.file.hashes.sha1Hash.toLowerCase();
      }
      if (onedriveItem.file.hashes.sha256Hash) {
        processed.hashes!.sha256 =
          onedriveItem.file.hashes.sha256Hash.toLowerCase();
      }
    }

    if (contentSource && requiredHashes) {
      const moreHashes = await this.computeMissingHashesManually(
        contentSource,
        requiredHashes,
        Object.keys(processed.hashes ?? {}) as SupportedHash[],
      );
      if (moreHashes) {
        Object.assign(processed.hashes, moreHashes);
      }

      // verify hashes
      this.contentProcessorService.verifyHashes(
        contentSource.hashes,
        processed.hashes,
      );
    }

    if (onedriveItem.thumbnails?.length) {
      for (const thumbSet of onedriveItem.thumbnails) {
        const importThumb = async (
          set: MicrosoftGraph.ThumbnailSet,
          key: string,
          thumb: MicrosoftGraph.Thumbnail | null | undefined,
        ) => {
          if (!thumb) {
            return;
          }
          const assetKey = `thumbnail.${set.id}.` + key;
          const metadata: ContentAssetMetadata = new ContentAssetMetadata({
            key: assetKey,
            mimeType: 'image/jpeg',
            contentSize: undefined,
            fileName: assetKey,
            contentETag: onedriveItem.eTag ?? uuidv4(),
            url: thumb.url ?? undefined,
          });

          if (thumb.url) {
            // prefetch
            this.logger.verbose(
              'prefetching thumbnail asset from url ' + thumb.url,
            );
            this.metricService.registerExternalRead();
            const prefetchResponse = await RequestUtils.readFromURL(thumb.url, {
              method: 'HEAD',
            });
            if (prefetchResponse.message.statusCode === 200) {
              metadata.contentETag =
                prefetchResponse.message.headers['etag']?.toString() ??
                metadata.contentETag;

              this.logger.debug(
                `updating content ETag from prefetch to ${metadata.contentETag}`,
              );

              const prefetchedContentLength =
                prefetchResponse.message.headers['content-length'];
              if (prefetchedContentLength) {
                metadata.contentSize = parseInt(
                  prefetchedContentLength.toString(),
                  10,
                );
                this.logger.debug(
                  `updating content size from prefetch to ${metadata.contentSize}`,
                );
              }
            } else {
              this.logger.error(
                `error prefetching thumbnail: ${prefetchResponse.message.statusCode} ${prefetchResponse.message.statusMessage} from url ${thumb.url}`,
              );
              this.logger.debug(
                'error response body: ' + prefetchResponse.body.toString(),
              );
            }
          }

          assets.push(metadata);

          const imported = new ContentMetadataImageThumbnail({
            assetKey,
            fileName: assetKey,
            format: undefined,
            size: undefined,
            width: thumb.width ?? undefined,
            height: thumb.height ?? undefined,
            url: thumb.url ?? undefined,
          });
          thumbnails.push(imported);
        };
        await importThumb(thumbSet, 'small', thumbSet.small);
        await importThumb(thumbSet, 'medium', thumbSet.medium);
        await importThumb(thumbSet, 'large', thumbSet.large);
      }
    }

    if (onedriveItem.file?.mimeType?.startsWith('image/')) {
      processed.facets!.push('image');
      processed.image = new ContentMetadataImage({
        thumbnails: thumbnails,
        width: onedriveItem.image?.width ?? undefined,
        height: onedriveItem.image?.height ?? undefined,
      });
    }

    if (onedriveItem.file?.mimeType?.startsWith('video/')) {
      processed.facets!.push('video');
      processed.video = new ContentMetadataVideo({
        thumbnails: thumbnails,
        width: onedriveItem.video?.width ?? undefined,
        height: onedriveItem.video?.height ?? undefined,
        duration: onedriveItem.video?.duration ?? undefined,
      });
    }

    return processed;
  }

  private async computeMissingHashesManually(
    contentSource: UploadedContent,
    requiredHashes: SupportedHash[],
    computedHashes: SupportedHash[],
  ): Promise<{[key: string]: string}> {
    const out: {[key: string]: string} = {};
    const missingHashes = requiredHashes.filter(
      c => !computedHashes.includes(c),
    );
    if (!missingHashes.length) {
      return out;
    }

    let bufferStream = await contentSource.content.stream();

    // pipe buffer stream as needed in order to compute requested hashes
    for (const computeHash of missingHashes) {
      this.logger.warn(
        'required hash of type ' +
          computeHash +
          ' is not supported on backbone and has to be computed manually.',
      );
      bufferStream = this.contentProcessorService.wrapStreamWithHashing(
        bufferStream,
        computeHash,
        (hash: string) => {
          out[computeHash] = hash;
        },
      );
    }

    // read stream to buffer to compute hashes
    await StreamUtils.streamToVoid(bufferStream);

    // return computed hashes
    return out;
  }

  private async getOnedriveClient(tenant: ClientTenant): Promise<{
    client: Client;
    backbone: OnedriveBackboneTenant;
  }> {
    const backBone = (await this.onedriveBackboneManager.findById(
      tenant.backboneId,
    ))!;

    const onedriveClient: Client =
      this.msGraphTokenService.buildClientForUserId(backBone.ownerPrincipalId);

    return {
      client: onedriveClient,
      backbone: backBone,
    };
  }

  public static buildOnedrivePath(driveId: string, path: string) {
    const cleanedPath = SanitizationUtils.stripSlashes(
      PathUtils.cleanPath(path),
    );

    return (
      '/me/drives/' +
      SanitizationUtils.stripSlashes(driveId) +
      '/root' +
      (cleanedPath.length
        ? ':/' +
          AbstractContentManagerService.encodeURIComponentPath(cleanedPath)
        : '')
    );
  }

  public static buildOnedrivePathForItem(driveId: string, itemId: string) {
    const cleanedItemId = SanitizationUtils.sanitizeFilename(itemId);
    return '/me/drives/' + driveId + '/items/' + cleanedItemId;
  }
}
