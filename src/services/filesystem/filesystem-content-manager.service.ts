import {inject, injectable, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {repository} from '@loopback/repository';
import fs from 'fs-extra';
import * as path from 'path';
import {ConfigurationBindings, LoggerBindings} from '../../key';
import {
  ClientTenant,
  ClientTenantBackbone,
  ContentAssetMetadata,
  FilesystemBackboneTenant,
  FilesystemContent,
  StorageNode,
} from '../../models';
import {
  ContentWithMetadata,
  IContentMetadata,
} from '../../models/content/content-models.model';
import {ContentStreamer} from '../../models/content/content-streamer.model';
import {FilesystemContentRepository} from '../../repositories/filesystem-content.repository';
import {RestContext} from '../../rest';
import {ObjectUtils} from '../../utils';
import {AppCustomConfig} from '../../utils/configuration-utils';
import {SanitizationUtils} from '../../utils/sanitization-utils';
import {StreamUtils} from '../../utils/stream-utils';
import {AbstractBackboneManagerService} from '../content';
import {UnmanagedContentManagerService} from '../content/unmanaged-content-manager.service';
import {MetricService} from '../metric.service';
import {FilesystemBackboneManager} from './filesystem-backbone-manager.service';

@injectable()
export class FilesystemContentManager extends UnmanagedContentManagerService<
  FilesystemContent,
  FilesystemBackboneTenant
> {
  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER) private logger: WinstonLogger,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
    @repository(FilesystemContentRepository)
    private contentRepository: FilesystemContentRepository,
    @service(FilesystemBackboneManager)
    private filesystemBackboneManager: FilesystemBackboneManager,
    @service(MetricService)
    private metricService: MetricService,
  ) {
    super(logger);
  }

  get engineVersion(): number {
    return 4;
  }

  public get typeCode(): string {
    return ClientTenantBackbone.FILESYSTEM;
  }

  public get enabled(): boolean {
    return !!this.configuration.filesystem.enable;
  }

  protected getRepository() {
    return this.contentRepository;
  }

  protected getBackboneManager(): AbstractBackboneManagerService<FilesystemBackboneTenant> {
    return this.filesystemBackboneManager;
  }

  protected async storeContentInStorage(
    backbone: FilesystemBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: FilesystemContent,
    source: ContentStreamer,
  ): Promise<void> {
    // compute storage path
    const nodeStorageSpec = await this.decideWhereToPutTheFile(
      tenant,
      node,
      entity,
    );
    entity.storagePath = nodeStorageSpec.fullpath;

    // create folder if missing
    this.createFolderIfMissing(nodeStorageSpec.folder);

    // move content to destination
    this.logger.debug(
      `copying new content ${entity.key} - ${entity.uuid} into ${nodeStorageSpec.fullpath}`,
    );

    await this.writeContentToFile(source, nodeStorageSpec.fullpath);

    this.logger.verbose(
      `copied new content ${entity.key} - ${entity.uuid} into ${nodeStorageSpec.fullpath}`,
    );
  }

  protected async storeAssetContentInStorage(
    backbone: FilesystemBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: FilesystemContent,
    asset: ContentWithMetadata,
    source: ContentStreamer,
  ): Promise<void> {
    const pointers = await this.decideWhereToPutTheAssetFile(
      tenant,
      node,
      entity,
      asset,
    );

    this.logger.verbose(
      'storing asset ' + asset.key + ' on filesystem at ' + pointers.fullpath,
    );

    this.createFolderIfMissing(pointers.folder);

    await this.writeContentToFile(asset.content, pointers.fullpath);
    asset.remoteId = pointers.fullpath;

    this.logger.verbose(
      'stored asset ' + asset.key + ' on filesystem at ' + pointers.fullpath,
    );
  }

  protected async fetchContentFromStorage(
    backbone: FilesystemBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: FilesystemContent,
  ): Promise<ContentStreamer> {
    const pointers = this.locateContentFile(entity);
    this.metricService.registerExternalReadWithData();
    return ContentStreamer.fromPath(pointers.fullpath);
  }

  protected async fetchAssetContentFromStorage(
    backbone: FilesystemBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: FilesystemContent,
    asset: ContentAssetMetadata,
  ): Promise<ContentStreamer> {
    const pointers = this.locateContentAssetFile(entity, asset);
    this.metricService.registerExternalReadWithData();
    return ContentStreamer.fromPath(pointers.fullpath);
  }

  protected async deleteContentFromStorage(
    backbone: FilesystemBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: FilesystemContent,
  ): Promise<void> {
    const pointers = this.locateContentFile(entity);
    this.metricService.registerExternalWrite();
    await fs.remove(pointers.fullpath);
  }

  protected async deleteContentAssetFromStorage(
    backbone: FilesystemBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: FilesystemContent,
    asset: ContentAssetMetadata,
  ): Promise<void> {
    const pointers = this.locateContentAssetFile(entity, asset);
    this.metricService.registerExternalWrite();
    await fs.remove(pointers.fullpath);
  }

  protected async afterContentDeletion(
    backbone: FilesystemBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: FilesystemContent,
  ): Promise<void> {
    // @override
    ObjectUtils.notNull(super.afterContentDeletion);

    if (entity.engineVersion < 4) {
      this.metricService.registerExternalWrite();
      await fs.remove(entity.storagePath + '/' + entity.uuid + '-assets');
    }
  }

  private async decideWhereToPutTheFile(
    tenant: ClientTenant,
    node: StorageNode,
    contentData: FilesystemContent,
  ): Promise<FilesystemContentLocation> {
    // fetch backbone
    const backBone = await this.filesystemBackboneManager.findById(
      tenant.backboneId,
    );
    if (!backBone) {
      throw new Error('Backbone is missing');
    }
    if (!node?.uuid) {
      throw new Error('Node UUID is missing');
    }
    if (!contentData?.uuid || !contentData?.createdAt) {
      throw new Error('Content data is missing');
    }

    let folder = ObjectUtils.require(
      this.configuration.filesystem,
      'rootFolder',
    );

    if (backBone.relativePath?.length) {
      folder =
        folder + '/' + SanitizationUtils.stripSlashes(backBone.relativePath);
    }
    if (tenant.rootLocation?.length) {
      folder =
        folder + '/' + SanitizationUtils.stripSlashes(tenant.rootLocation);
    }
    folder =
      folder +
      '/' +
      SanitizationUtils.stripSlashes(this.sanitizeTenantCode(tenant.code));
    folder = folder + '/' + node.uuid;

    const filename =
      contentData.uuid + this.mimeTypeToExtension(contentData.mimeType);

    return {
      folder,
      filename,
      fullpath: `${folder}/${filename}`,
    };
  }

  private async decideWhereToPutTheAssetFile(
    tenant: ClientTenant,
    node: StorageNode,
    contentData: FilesystemContent,
    asset: IContentMetadata,
  ): Promise<FilesystemContentLocation> {
    const mainContentLocationSpec = await this.decideWhereToPutTheFile(
      tenant,
      node,
      contentData,
    );
    const filename =
      contentData.uuid +
      '-' +
      asset.key +
      this.mimeTypeToExtension(contentData.mimeType);

    return {
      folder: mainContentLocationSpec.folder,
      filename,
      fullpath: `${mainContentLocationSpec.folder}/${filename}`,
    };
  }

  private createFolderIfMissing(d: string) {
    this.metricService.registerExternalRead();
    if (!fs.existsSync(d)) {
      this.logger.verbose('creating upload directory ' + d);
      this.metricService.registerExternalWrite();
      fs.mkdirSync(d, {
        recursive: true,
        mode: 0o755,
      });
    }
  }

  private async writeContentToFile(
    source: ContentStreamer,
    destination: string,
  ): Promise<void> {
    ObjectUtils.notNull(source, destination);
    if (!source.hasContent) {
      throw new Error('Source content is missing');
    }

    this.metricService.registerExternalWriteWithData();
    const writeStream = fs.createWriteStream(destination);
    const sourceStream = await source.stream();

    const outstr = StreamUtils.pipeWithErrors(sourceStream, writeStream);
    await StreamUtils.writableToPromise(outstr);
  }

  /*
   * first prototype:
   * copies the content from a node to another already existing node
   * both belonging to the same tenant
   */

  protected async copyContentInStorage(
    sourceBackbone: FilesystemBackboneTenant,
    sourceTenant: ClientTenant,
    sourceNode: StorageNode,
    sourceContent: FilesystemContent,
    targetBackbone: FilesystemBackboneTenant,
    targetTenant: ClientTenant,
    targetNode: StorageNode,
    newContentRecord: FilesystemContent,
    context: RestContext,
  ): Promise<void> {
    // compute storage path for the new content
    const newContentStorageSpec = await this.decideWhereToPutTheFile(
      targetTenant,
      targetNode,
      newContentRecord,
    );
    newContentRecord.storagePath = newContentStorageSpec.fullpath;

    // persist DRAFT entity
    newContentRecord = await this.contentRepository.create(newContentRecord);

    // copy from the source file to the target file
    const sourceFileLocation = this.locateContentFile(sourceContent);

    this.createFolderIfMissing(newContentStorageSpec.folder);
    await fs.promises.copyFile(
      sourceFileLocation.fullpath,
      newContentStorageSpec.fullpath,
    );
  }

  protected async copyContentAssetInStorage(
    sourceBackbone: FilesystemBackboneTenant,
    sourceTenant: ClientTenant,
    sourceNode: StorageNode,
    sourceContent: FilesystemContent,
    sourceAsset: ContentAssetMetadata,
    targetBackbone: FilesystemBackboneTenant,
    targetTenant: ClientTenant,
    targetNode: StorageNode,
    newContentRecord: FilesystemContent,
    newAsset: ContentAssetMetadata,
    context: RestContext,
  ): Promise<void> {
    // copy the asset content
    const sourceAssetPointers = this.locateContentAssetFile(
      sourceContent,
      sourceAsset,
    );
    const targetAssetPointers = await this.decideWhereToPutTheAssetFile(
      targetTenant,
      targetNode,
      newContentRecord,
      newAsset,
    );

    newAsset.remoteId = targetAssetPointers.fullpath;

    this.createFolderIfMissing(targetAssetPointers.folder);
    await fs.promises.copyFile(
      sourceAssetPointers.fullpath,
      targetAssetPointers.fullpath,
    );
  }

  private locateContentFile(
    entity: FilesystemContent,
  ): FilesystemContentLocation {
    if (entity.engineVersion >= 4) {
      return this.locatorFromFullPath(entity.storagePath);
    } else if (entity.engineVersion < 4) {
      return {
        folder: entity.storagePath,
        filename: entity.uuid,
        fullpath: `${entity.storagePath}/${entity.uuid}`,
      };
    }
    throw new Error(
      'Cannot locate content for entity managed by engine version ' +
        entity.engineVersion,
    );
  }

  private locateContentAssetFile(
    entity: FilesystemContent,
    asset: IContentMetadata,
  ): FilesystemContentLocation {
    if (entity.engineVersion >= 4) {
      return this.locatorFromFullPath(ObjectUtils.require(asset, 'remoteId'));
    } else if (entity.engineVersion < 4) {
      const folder = `${entity.storagePath}/${entity.uuid}-assets`;
      const filename = asset.key;
      const fullpath = `${folder}/${filename}`;

      return {folder, filename, fullpath};
    }
    throw new Error(
      'Cannot locate content for entity managed by engine version ' +
        entity.engineVersion,
    );
  }

  private locatorFromFullPath(fullpath: string): FilesystemContentLocation {
    return {
      folder: path.dirname(fullpath),
      filename: path.basename(fullpath),
      fullpath,
    };
  }
}

interface FilesystemContentLocation {
  folder: string;
  filename: string;
  fullpath: string;
}

/*
ENGINE CHANGELOG

- version 4:
  updated tree model:
    now tenant.rootLocation is considered
    content entity storagePath attribute contains the full path of the content file
    asset remoteId attribute contains the full path of the content file

- version 1:
  entity.storagePath contains nodepath.
  effective tree model:
    nodepath = this.configuration.filesystem.rootFolder + '/' +
      SanitizationUtils.stripSlashes(backBone.relativePath) + '/' +
      'tenant-' + SanitizationUtils.stripSlashes(this.sanitizeTenantCode(tenant.code)) + '/' +
      contentData.uuid.substr(contentData.uuid.length - 2) + '/' +
      'node-' + node.uuid

    content file: nodepath + '/' + content.uuid
    content asset file: nodepath + '/' + content.uuid + '-assets/' + asset.key
*/
