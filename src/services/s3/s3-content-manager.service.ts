import {inject, injectable, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import AWS from 'aws-sdk';
import {ConfigurationBindings, LoggerBindings} from '../../key';
import {
  ClientTenant,
  ClientTenantBackbone,
  ContentAssetMetadata,
  ContentWithMetadata,
  S3BackboneTenant,
  S3Content,
  StorageNode,
} from '../../models';
import {ContentStreamer} from '../../models/content/content-streamer.model';
import {
  CommonS3DeleteObjectRequest,
  CommonS3GetObjectContentOutput,
  CommonS3GetObjectContentRequest,
  CommonS3PutObjectOutput,
  CommonS3PutObjectRequest,
} from '../../models/s3/common-s3.model';
import {PaginationRepository, S3ContentRepository} from '../../repositories';
import {
  AppCustomConfig,
  AppCustomS3Config,
  ObjectUtils,
  RequestUtils,
  retry,
  SanitizationUtils,
} from '../../utils';
import {UnmanagedContentManagerService} from '../content/unmanaged-content-manager.service';
import {MetricService} from '../metric.service';
import {IS3DialectHandler} from './dialects';
import {S3BackboneManager} from './s3-backbone-manager.service';
import {S3ClientService} from './s3-client.service';
import {S3DialectManager} from './s3-dialect-manager.service';

@injectable()
export class S3ContentManager extends UnmanagedContentManagerService<
  S3Content,
  S3BackboneTenant
> {
  private DEFAULT_KEY_SEPARATOR = '/';

  constructor(
    @inject(LoggerBindings.S3_LOGGER)
    private logger: WinstonLogger,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private rootConfiguration: AppCustomConfig,
    @service(S3BackboneManager)
    private backboneManager: S3BackboneManager,
    @service(S3ClientService)
    private clientService: S3ClientService,
    @repository(S3ContentRepository)
    private contentRepository: S3ContentRepository,
    @service(MetricService)
    private metricService: MetricService,
    @service(S3DialectManager)
    private s3DialectManager: S3DialectManager,
  ) {
    super(logger);
  }

  public get typeCode(): string {
    return ClientTenantBackbone.S3;
  }

  public get enabled(): boolean {
    return !!this.rootConfiguration.s3.enable;
  }

  get s3Config(): AppCustomS3Config {
    return this.rootConfiguration.s3;
  }

  protected getBackboneManager() {
    return this.backboneManager;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected getRepository(): PaginationRepository<S3Content, number, any> {
    return this.contentRepository;
  }

  protected async storeContentInStorage(
    backbone: S3BackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: S3Content,
    source: ContentStreamer,
  ): Promise<void> {
    // retrieve dialect handler
    const dialectHandler = this.s3DialectManager.getDialectHandler(
      backbone.dialect,
    );

    // compute storage path
    const storagePath = await this.computeStoragePath(
      tenant,
      node,
      entity,
      dialectHandler,
    );
    entity.remoteId = storagePath.remoteContentFileKey;

    this._logger.debug(
      `uploading new content ${entity.key} - ${entity.uuid} to ${this.typeCode} ` +
        `with key ${storagePath.remoteContentFileKey}`,
    );

    const uploadResult = await this.uploadToRemote(backbone, tenant, source, {
      Bucket: storagePath.bucketId,
      Key: storagePath.remoteContentFileKey,
      estimatedSize: entity.contentSize,
    });

    // patch local record with remote storage metadata
    entity.remoteItem = uploadResult;
    entity.remoteETag = this.getOrError(uploadResult, 'ETag');

    this._logger.verbose(
      `uploaded new content ${entity.key} - ${entity.uuid} to ${this.typeCode} ` +
        `with key ${storagePath.remoteContentFileKey}`,
    );
  }

  protected async storeAssetContentInStorage(
    backbone: S3BackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: S3Content,
    asset: ContentWithMetadata,
    source: ContentStreamer,
  ): Promise<void> {
    // retrieve dialect handler
    const dialectHandler = this.s3DialectManager.getDialectHandler(
      backbone.dialect,
    );

    const remoteAssetKey = await this.buildAssetRemoteKey(
      tenant,
      node,
      entity,
      asset,
      dialectHandler,
    );

    this._logger.verbose(
      'storing asset ' +
        asset.key +
        ' on ' +
        this.typeCode +
        ' with key ' +
        remoteAssetKey,
    );

    const uploadResult = await this.uploadToRemote(backbone, tenant, source, {
      Bucket: ObjectUtils.require(tenant, 'rootLocation'),
      Key: remoteAssetKey,
      estimatedSize: asset.contentSize,
    });

    // patch local record with remote storage metadata
    asset.contentETag = uploadResult.ETag ?? asset.contentETag;
    asset.remoteId = remoteAssetKey;

    this._logger.verbose(
      'stored asset ' +
        asset.key +
        ' on ' +
        this.typeCode +
        ' with key ' +
        remoteAssetKey,
    );
  }

  protected async fetchContentFromStorage(
    backbone: S3BackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: S3Content,
  ): Promise<ContentStreamer> {
    const remoteContentStreamer = await this.getRemoteContent(
      backbone,
      tenant,
      {
        Bucket: ObjectUtils.require(tenant, 'rootLocation'),
        Key: entity.remoteId,
        TotalSize: ObjectUtils.require(entity, 'contentSize'),
      },
    );

    if (!remoteContentStreamer) {
      throw new HttpErrors.NotFound('Node content not found');
    }

    return remoteContentStreamer;
  }

  protected async fetchAssetContentFromStorage(
    backbone: S3BackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: S3Content,
    asset: ContentAssetMetadata,
  ): Promise<ContentStreamer> {
    const remoteContentStreamer = await this.getRemoteContent(
      backbone,
      tenant,
      {
        Bucket: ObjectUtils.require(tenant, 'rootLocation'),
        Key: ObjectUtils.require(asset, 'remoteId'),
        TotalSize: ObjectUtils.require(asset, 'contentSize'),
      },
    );

    if (!remoteContentStreamer) {
      throw new HttpErrors.NotFound('Node asset content not found');
    }

    return remoteContentStreamer;
  }

  protected async deleteContentFromStorage(
    backbone: S3BackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    content: S3Content,
  ): Promise<void> {
    await this.deleteRemoteContent(backbone, tenant, {
      Bucket: ObjectUtils.require(tenant, 'rootLocation'),
      Key: content.remoteId,
    });
  }

  protected async deleteContentAssetFromStorage(
    backbone: S3BackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: S3Content,
    asset: ContentAssetMetadata,
  ): Promise<void> {
    await this.deleteRemoteContent(backbone, tenant, {
      Bucket: ObjectUtils.require(tenant, 'rootLocation'),
      Key: ObjectUtils.require(asset, 'remoteId'),
    });
  }

  protected async computeStorageBucket(
    tenant: ClientTenant,
    backBone?: S3BackboneTenant,
  ): Promise<{bucketId: string}> {
    // fetch backbone
    backBone =
      backBone ?? (await this.getBackboneManager().findById(tenant.backboneId));

    if (!backBone) {
      throw new Error('Backbone is missing');
    }

    return {
      bucketId: ObjectUtils.require(tenant, 'rootLocation'),
    };
  }

  protected async computeStoragePathTenant(
    tenant: ClientTenant,
    backBone: S3BackboneTenant | undefined,
    dialectHandler: IS3DialectHandler | null,
  ): Promise<{bucketId: string; tenantFolderKey: string}> {
    // fetch backbone
    backBone =
      backBone ?? (await this.getBackboneManager().findById(tenant.backboneId));

    if (!backBone) {
      throw new Error('Backbone is missing');
    }

    const {bucketId} = await this.computeStorageBucket(tenant, backBone);

    return {
      bucketId,
      tenantFolderKey: `${SanitizationUtils.sanitizeFilename(tenant.code)}`,
    };
  }

  protected async computeStoragePath(
    tenant: ClientTenant,
    node: StorageNode,
    contentData: S3Content,
    dialectHandler: IS3DialectHandler | null,
  ): Promise<{
    bucketId: string;
    remoteContentFolderKey: string;
    remoteContentFileKey: string;
  }> {
    // fetch backbone
    const backBone = await this.getBackboneManager().findById(
      tenant.backboneId,
    );

    const parentResolution = await this.computeStoragePathTenant(
      tenant,
      backBone,
      dialectHandler,
    );

    const separator = dialectHandler?.getSeparator
      ? dialectHandler.getSeparator()
      : this.DEFAULT_KEY_SEPARATOR;

    const remoteContentFolderKey =
      `${parentResolution.tenantFolderKey}${separator}` +
      `${SanitizationUtils.sanitizeFilename(node.uuid)}`;

    const ext = this.mimeTypeToExtension(contentData.mimeType);

    const remoteContentFileKey =
      `${remoteContentFolderKey}${separator}` +
      `${contentData.uuid}-${contentData.key}.${ext}`;

    return {
      bucketId: parentResolution.bucketId,
      remoteContentFolderKey,
      remoteContentFileKey,
    };
  }

  protected async buildAssetRemoteKey(
    tenant: ClientTenant,
    node: StorageNode,
    content: S3Content,
    asset: ContentWithMetadata,
    dialectHandler: IS3DialectHandler | null,
  ): Promise<string> {
    const parentKey = await this.computeStoragePath(
      tenant,
      node,
      content,
      dialectHandler,
    );

    const separator = dialectHandler?.getSeparator
      ? dialectHandler.getSeparator()
      : this.DEFAULT_KEY_SEPARATOR;

    const ext = this.mimeTypeToExtension(asset.mimeType);

    return (
      `${parentKey.remoteContentFolderKey}${separator}` +
      `${content.uuid}-${asset.key}.${ext}`
    );
  }

  protected getEffectiveTresholdForSingleBufferingRequest(
    dialectHandler: IS3DialectHandler | null,
  ): number {
    const defaultValue = this.s3Config.defaultTresholdForSingleBufferingRequest;
    if (dialectHandler?.getTresholdForSingleBufferingRequest) {
      return (
        dialectHandler.getTresholdForSingleBufferingRequest() ?? defaultValue
      );
    }
    return defaultValue;
  }

  protected getEffectiveTresholdForSinglePartUpload(
    dialectHandler: IS3DialectHandler | null,
  ): number {
    const defaultValue = this.s3Config.defaultTresholdForSinglePartUpload;
    if (dialectHandler?.getTresholdForSinglePartUpload) {
      return dialectHandler.getTresholdForSinglePartUpload() ?? defaultValue;
    }
    return defaultValue;
  }

  protected getEffectiveMultipartUploadPartSize(
    dialectHandler: IS3DialectHandler | null,
  ): number {
    const defaultValue = this.s3Config.defaultMultipartUploadPartSize;
    if (dialectHandler?.getMultipartUploadPartSize) {
      return dialectHandler.getMultipartUploadPartSize() ?? defaultValue;
    }
    return defaultValue;
  }

  private async getClient(backbone: S3BackboneTenant): Promise<AWS.S3> {
    return this.clientService.getClient(backbone);
  }

  protected async getRemoteContent(
    backbone: S3BackboneTenant,
    tenant: ClientTenant,
    request: CommonS3GetObjectContentRequest,
  ): Promise<CommonS3GetObjectContentOutput> {
    const client = await this.getClient(backbone);

    const dialectHandler = this.s3DialectManager.getDialectHandler(
      backbone.dialect,
    );

    if (
      request.TotalSize &&
      request.TotalSize <
        this.getEffectiveTresholdForSingleBufferingRequest(dialectHandler)
    ) {
      return this.getRemoteContentViaSingleRequest(client, request);
    } else {
      return this.getRemoteContentViaStream(client, request);
    }
  }

  protected async getRemoteContentViaStream(
    client: AWS.S3,
    request: CommonS3GetObjectContentRequest,
  ): Promise<CommonS3GetObjectContentOutput> {
    this.logger.debug(
      `preparing provider to fetch remote content ${request.Bucket}/${request.Key} via stream`,
    );

    return ContentStreamer.fromStreamProvider(async r => {
      return retry(
        async () => {
          const reqPayload: AWS.S3.GetObjectRequest = {
            Bucket: request.Bucket,
            Key: request.Key,
            Range: r
              ? RequestUtils.toPartialRequestByteHeader(r[0], r[1])
              : undefined,
          };

          this.logger.debug(
            `executing GET request to remote server to open read stream`,
          );
          const requestGET = client.getObject(reqPayload);

          this.metricService.registerExternalReadWithData();
          return requestGET.createReadStream();
        },
        {
          logger: this.logger,
          description: 'fetching remote content from S3 via streaming',
          // with these settings takes approx. 4600 ms to fail 5 retries
          interval: 250,
          maxRetries: 5,
          linearBackoff: 0.75,
          exponentialBackoff: 1.4,
          canRetry: err => {
            if ((err as AWS.AWSError)?.statusCode) {
              const status = (err as AWS.AWSError).statusCode;
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
    });
  }

  protected async getRemoteContentViaSingleRequest(
    client: AWS.S3,
    request: CommonS3GetObjectContentRequest,
  ): Promise<CommonS3GetObjectContentOutput> {
    this.logger.debug(
      `fetching remote content ${request.Bucket}/${request.Key} via single request`,
    );

    return ContentStreamer.fromStreamProvider(async r => {
      return retry(
        async () => {
          const reqPayload: AWS.S3.GetObjectRequest = {
            Bucket: request.Bucket,
            Key: request.Key,
            Range: r
              ? RequestUtils.toPartialRequestByteHeader(r[0], r[1])
              : undefined,
          };

          const response = await client.getObject(reqPayload).promise();
          // const status = response.$response.httpResponse.statusCode;

          this.metricService.registerExternalReadWithData();

          this.logger.verbose(
            'possible minor performance hit: remote content is fetched into in-memory buffer',
          );

          const responseBuffer = Buffer.from(response.Body!);
          return ContentStreamer.fromBuffer(responseBuffer).stream();
        },
        {
          logger: this.logger,
          description: 'fetching remote content from S3 via buffering',
          // with these settings takes approx. 4600 ms to fail 5 retries
          interval: 250,
          maxRetries: 5,
          linearBackoff: 0.75,
          exponentialBackoff: 1.4,
          canRetry: err => {
            if ((err as AWS.AWSError)?.statusCode) {
              const status = (err as AWS.AWSError).statusCode;
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
    });
  }

  protected async deleteRemoteContent(
    backbone: S3BackboneTenant,
    tenant: ClientTenant,
    request: CommonS3DeleteObjectRequest,
  ): Promise<boolean> {
    const bucketId = request.Bucket;
    const remoteKey = request.Key;

    if (!bucketId || !remoteKey) {
      throw new Error('missing parameters');
    }

    const client = await this.getClient(backbone);

    this.logger.verbose('deleting remote item ' + remoteKey);
    try {
      this.metricService.registerExternalWrite();
      await client
        .deleteObject({
          Bucket: bucketId,
          Key: remoteKey,
        })
        .promise();
      this.logger.debug('deleted remote item ' + remoteKey);
      return true;
    } catch (err) {
      if (err?.requestId) {
        const tErr = err as AWS.AWSError;
        if (tErr.code === 'NoSuchKey') {
          // element has been deleted already
          this.logger.warn(
            `remote item ${remoteKey} has already been deleted (${tErr.code}: ${tErr.message})`,
          );
          return true;
        }

        this.logger.error('got AWSError deleting remote item', tErr);
        this.logger.error('AWSError.code: ' + tErr.code);
        this.logger.error('AWSError.message: ' + tErr.message);
        this.logger.error('AWSError.name: ' + tErr.name);
      } else {
        this.logger.error(
          'got generic error deleting remote item ' + remoteKey,
          err,
        );
      }

      throw err;
    }
  }

  protected async uploadToRemote(
    backbone: S3BackboneTenant,
    tenant: ClientTenant,
    source: ContentStreamer,
    target: CommonS3PutObjectRequest,
  ): Promise<CommonS3PutObjectOutput> {
    const client = await this.getClient(backbone);
    const dialectHandler = this.s3DialectManager.getDialectHandler(
      backbone.dialect,
    );

    if (
      !target.estimatedSize ||
      target.estimatedSize <=
        this.getEffectiveTresholdForSinglePartUpload(dialectHandler)
    ) {
      return this.uploadToRemoteViaSingleRequest(client, source, target);
    } else {
      return this.uploadToRemoteViaMultipartUpload(
        backbone,
        client,
        source,
        target,
      );
    }
  }

  protected async uploadToRemoteViaMultipartUpload(
    backbone: S3BackboneTenant,
    client: AWS.S3,
    source: ContentStreamer,
    target: CommonS3PutObjectRequest,
  ): Promise<CommonS3PutObjectOutput> {
    const dialectHandler = this.s3DialectManager.getDialectHandler(
      backbone.dialect,
    );

    this.logger.debug(
      'uploading object on S3 via multipart upload with payload',
      {
        Bucket: target.Bucket,
        Key: target.Key,
      },
    );

    try {
      this.metricService.registerExternalWriteWithData();
      const sourceStream = await source.stream();
      const res = await client
        .upload(
          {
            Bucket: target.Bucket,
            Key: target.Key,
            Body: sourceStream,
          },
          {
            partSize: this.getEffectiveMultipartUploadPartSize(dialectHandler),
            queueSize: 3,
          },
        )
        .promise();

      return {
        ...res,
      };
    } catch (err) {
      if (err?.requestId) {
        const tErr = err as AWS.AWSError;
        this.logger.error('got AWSError during upload', tErr);
        this.logger.error('AWSError.code: ' + tErr.code);
        this.logger.error('AWSError.message: ' + tErr.message);
        this.logger.error('AWSError.name: ' + tErr.name);
      } else {
        this.logger.error('got generic error during upload', err);
      }
      throw err;
    }
  }

  protected async uploadToRemoteViaSingleRequest(
    client: AWS.S3,
    source: ContentStreamer,
    target: CommonS3PutObjectRequest,
  ): Promise<CommonS3PutObjectOutput> {
    if (!target.estimatedSize) {
      this.logger.warn(
        'possible major performance hit: stream is loaded into in-memory buffer',
      );
    }

    this.logger.debug(
      'prefetching stream content to be uploaded in memory buffer',
    );
    const buffer = await source.toBuffer();

    this.logger.debug(
      'uploading object on S3 via single request with payload',
      {
        Bucket: target.Bucket,
        Key: target.Key,
      },
    );

    try {
      this.metricService.registerExternalWriteWithData();
      return await client
        .putObject({
          Bucket: target.Bucket,
          Key: target.Key,
          Body: buffer,
        })
        .promise();
    } catch (err) {
      if (err?.requestId) {
        const tErr = err as AWS.AWSError;
        this.logger.error('got AWSError during upload', tErr);
        this.logger.error('AWSError.code: ' + tErr.code);
        this.logger.error('AWSError.message: ' + tErr.message);
        this.logger.error('AWSError.name: ' + tErr.name);
      } else {
        this.logger.error('got generic error during upload', err);
      }
      throw err;
    }
  }

  async purgePhysicalContent(tenant: ClientTenant): Promise<void> {
    const backbone = await this.getBackbone(tenant);
    const client = await this.getClient(backbone);

    // retrieve dialect handler
    const dialectHandler = this.s3DialectManager.getDialectHandler(
      backbone.dialect,
    );

    const bucketSpecs = await this.computeStoragePathTenant(
      tenant,
      backbone,
      dialectHandler,
    );

    this.logger.info(`purging all content from bucket ${bucketSpecs.bucketId}`);

    const separator = dialectHandler?.getSeparator
      ? dialectHandler.getSeparator()
      : this.DEFAULT_KEY_SEPARATOR;

    // list and delete all
    const listParams: AWS.S3.Types.ListObjectsV2Request = {
      Bucket: bucketSpecs.bucketId,
      //Prefix: bucketSpecs.tenantFolderKey + separator,
      Delimiter: separator,
    };

    await this.visidDepthFirst(client, listParams, async (files, dirs) => {
      for (const nodeKey of files) {
        this.logger.debug(`visiting S3.F > ${nodeKey}`);
      }
      for (const nodeKey of dirs) {
        this.logger.debug(`visiting S3.D > ${nodeKey}`);
      }

      await this.batchDeleteKeys(backbone, client, bucketSpecs.bucketId, files);
    });
  }

  private async batchDeleteKeys(
    backbone: S3BackboneTenant,
    client: AWS.S3,
    bucketId: string,
    keys: string[],
  ): Promise<void> {
    if (!keys?.length) {
      return;
    }

    const dialect = this.s3DialectManager.getDialectHandler(backbone.dialect);
    if (dialect?.getSupportBatchDelete() ?? true) {
      // batch delete
      const deleteReq: AWS.S3.Types.DeleteObjectsRequest = {
        Bucket: bucketId,
        Delete: {
          Objects: keys.map(c => {
            const mapped: AWS.S3.Types.ObjectIdentifier = {
              Key: c!,
            };
            return mapped;
          }),
        },
      };

      this.logger.debug(`purging ${keys.length} nodes in batch mode`);
      await client.deleteObjects(deleteReq).promise();
      this.logger.verbose(`purged ${keys.length} nodes in batch mode`);
    } else {
      // mutliple single delete
      if (keys.length > 1) {
        this.logger.warn(
          'S3 dialect does not support batch delete. Consistency errors may arise.',
        );
      }

      this.logger.debug(`purging ${keys.length} nodes in one-by-one mode`);
      for (const key of keys) {
        await client
          .deleteObject({
            Bucket: bucketId,
            Key: key,
          })
          .promise();
      }
      this.logger.verbose(`purged ${keys.length} nodes in one-by-one mode`);
    }
  }

  private async visidDepthFirst(
    client: AWS.S3,
    params: AWS.S3.Types.ListObjectsV2Request,
    visitor: (files: string[], directories: string[]) => Promise<void>,
    prefix?: string,
  ): Promise<void> {
    const listParams: AWS.S3.Types.ListObjectsV2Request = {
      ...params,
      Prefix: prefix,
    };

    const listResponse = await client.listObjectsV2(listParams).promise();

    const files = (listResponse.Contents ?? []).map(c => c.Key!);
    const directories = (listResponse.CommonPrefixes ?? []).map(c =>
      c.Prefix!.substr(0, c.Prefix!.length - params.Delimiter!.length),
    );

    for (const cp of listResponse.CommonPrefixes ?? []) {
      await this.visidDepthFirst(client, params, visitor, cp.Prefix);
    }

    await visitor(files, directories);
  }
}
