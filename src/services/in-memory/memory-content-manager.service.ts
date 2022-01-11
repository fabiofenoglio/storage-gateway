import {BindingScope, inject, injectable, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {repository} from '@loopback/repository';
import {ConfigurationBindings, LoggerBindings} from '../../key';
import {
  ClientTenant,
  ClientTenantBackbone,
  ContentAssetMetadata,
  MemoryBackboneTenant,
  StorageNode,
} from '../../models';
import {ContentWithMetadata} from '../../models/content/content-models.model';
import {ContentStreamer} from '../../models/content/content-streamer.model';
import {MemoryContent} from '../../models/memory/memory-content.model';
import {PaginationRepository} from '../../repositories';
import {InMemoryContentRepository} from '../../repositories/in-memory.repository';
import {AppCustomConfig} from '../../utils';
import {AbstractBackboneManagerService} from '../content';
import {UnmanagedContentManagerService} from '../content/unmanaged-content-manager.service';
import {MetricService} from '../metric.service';
import {MemoryBackboneManager} from './memory-backbone-manager.service';

type InMemoryTenantData = {
  records: {[contentId: string]: MemoryContent};
  contents: {[contentId: string]: Buffer};
  assets: {[contentId: string]: ContentWithMetadata[]};
  assetsContent: {[assetContentId: string]: Buffer};
};

@injectable({scope: BindingScope.SINGLETON})
export class MemoryContentManager extends UnmanagedContentManagerService<
  MemoryContent,
  MemoryBackboneTenant
> {
  inMemory: {
    [backboneId: number]: {
      [tenantId: number]: InMemoryTenantData;
    };
  } = {};

  sequenceId = 0;

  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER)
    private logger: WinstonLogger,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
    @repository(InMemoryContentRepository)
    private inMemoryContentRepository: InMemoryContentRepository,
    @service(MemoryBackboneManager)
    private memoryBackboneManager: MemoryBackboneManager,
    @service(MetricService)
    private metricService: MetricService,
  ) {
    super(logger);
  }

  public get typeCode(): string {
    return ClientTenantBackbone.MEMORY;
  }

  public get enabled(): boolean {
    return !!this.configuration.memory.enable;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected getRepository(): PaginationRepository<MemoryContent, any, any> {
    return this.inMemoryContentRepository;
  }

  protected getBackboneManager(): AbstractBackboneManagerService<MemoryBackboneTenant> {
    return this.memoryBackboneManager;
  }

  protected async storeContentInStorage(
    backbone: MemoryBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: MemoryContent,
    source: ContentStreamer,
  ): Promise<void> {
    const tenantContainer = this.getTenantData(tenant);

    tenantContainer.records[entity.uuid] = entity;
    tenantContainer.contents[entity.uuid] = await source.toBuffer();
    tenantContainer.assets[entity.uuid] = [];

    this.metricService.registerExternalWriteWithData();
  }

  protected async storeAssetContentInStorage(
    backbone: MemoryBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    content: MemoryContent,
    asset: ContentWithMetadata,
    source: ContentStreamer,
  ): Promise<void> {
    const tenantContainer = this.getTenantData(tenant);

    asset.content = source;

    tenantContainer.assets[content.uuid].push(asset);
    tenantContainer.assetsContent[content.uuid + '/' + asset.key] =
      await source.toBuffer();

    this.metricService.registerExternalWriteWithData();
  }

  protected async fetchContentFromStorage(
    backbone: MemoryBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: MemoryContent,
  ): Promise<ContentStreamer> {
    const tenantContainer = this.getTenantData(tenant);

    const contentBuffer = tenantContainer.contents[entity.uuid];
    if (!contentBuffer) {
      throw new Error('Content not found for uuid ' + entity.uuid);
    }

    this.metricService.registerExternalReadWithData();
    return ContentStreamer.fromBuffer(contentBuffer);
  }

  protected async fetchAssetContentFromStorage(
    backbone: MemoryBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: MemoryContent,
    asset: ContentAssetMetadata,
  ): Promise<ContentStreamer> {
    const tenantContainer = this.getTenantData(tenant);

    const assetContent =
      tenantContainer.assetsContent[entity.uuid + '/' + asset.key];

    if (!assetContent) {
      throw new Error('Asset not found: ' + asset.key);
    }

    this.metricService.registerExternalReadWithData();
    return ContentStreamer.fromBuffer(assetContent);
  }

  protected async deleteContentFromStorage(
    backbone: MemoryBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: MemoryContent,
  ): Promise<void> {
    const tenantContainer = this.getTenantData(tenant);

    delete tenantContainer.records[entity.uuid];
    delete tenantContainer.contents[entity.uuid];

    this.metricService.registerExternalWrite();
  }

  protected async deleteContentAssetFromStorage(
    backbone: MemoryBackboneTenant,
    tenant: ClientTenant,
    node: StorageNode,
    entity: MemoryContent,
    asset: ContentAssetMetadata,
  ): Promise<void> {
    const tenantContainer = this.getTenantData(tenant);

    tenantContainer.assets[entity.uuid] = tenantContainer.assets[
      entity.uuid
    ].filter(e => e.key !== asset.key);

    this.metricService.registerExternalWrite();
  }

  private getTenantData(tenant: ClientTenant): InMemoryTenantData {
    let backbone = this.inMemory[tenant.backboneId];
    if (!backbone) {
      backbone = {};
      this.inMemory[tenant.backboneId] = backbone;
    }

    let out = backbone[tenant.id!];
    if (!out) {
      out = {records: {}, contents: {}, assets: {}, assetsContent: {}};
      backbone[tenant.id!] = out;
    }

    return out;
  }
}
