import {inject, injectable, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Client} from '@microsoft/microsoft-graph-client';
import * as MicrosoftGraph from '@microsoft/microsoft-graph-types';
import {ConfigurationBindings, ErrorBindings, LoggerBindings} from '../../key';
import {
  ClientTenant,
  MsGraphPageResponse,
  OnedriveBackboneTenant,
} from '../../models';
import {
  ClientTenantRepository,
  OnedriveContentRepository,
  StorageNodeRepository,
} from '../../repositories';
import {ObjectUtils} from '../../utils';
import {AppCustomConfig} from '../../utils/configuration-utils';
import {ErrorService} from '../error.service';
import {MsGraphTokenService} from './msgraph-token.service';
import {OnedriveBackboneManager} from './onedrive-backbone-manager.service';
import {OnedriveContentManager} from './onedrive-content-manager.service';

export interface CleanupContext {
  preview?: boolean;
  deletedFolders?: number;
  deletedFiles?: number;
  reclaimedSpace?: number;
}

@injectable()
export class OnedriveCleanupManager {
  ENABLED = false;

  constructor(
    @inject(LoggerBindings.ONEDRIVE_LOGGER) private logger: WinstonLogger,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
    @inject(ErrorBindings.ERROR_SERVICE) private errorService: ErrorService,
    @repository(OnedriveContentRepository)
    private contentRepository: OnedriveContentRepository,
    @repository(StorageNodeRepository)
    private storageNodeRepository: StorageNodeRepository,
    @repository(ClientTenantRepository)
    private clientTenantRepository: ClientTenantRepository,
    @service(OnedriveBackboneManager)
    private onedriveBackboneManager: OnedriveBackboneManager,
    @service(OnedriveContentManager)
    private onedriveContentManager: OnedriveContentManager,
    @service(MsGraphTokenService)
    private msGraphTokenService: MsGraphTokenService,
  ) {}

  public async cleanupAll(
    options?: Partial<CleanupContext>,
  ): Promise<CleanupContext> {
    if (!this.ENABLED) {
      throw new HttpErrors.Forbidden('Not allowed');
    }

    const ctx: CleanupContext = {
      preview: true,
      deletedFolders: 0,
      deletedFiles: 0,
      reclaimedSpace: 0,
      ...options,
    };

    const tenants = await this.clientTenantRepository.find({
      where: {
        backboneType: 'ONEDRIVE',
      },
    });

    for (const tenant of tenants) {
      await this.cleanupTenant(tenant, ctx);
    }

    return ctx;
  }

  private async cleanupTenant(
    tenant: ClientTenant,
    ctx: CleanupContext,
  ): Promise<void> {
    this.logger.info('cleaning up tenant ' + tenant.name);

    if (tenant.backboneType !== 'ONEDRIVE') {
      throw new Error(
        'Tenant ' + tenant.id + ' does not belong to this backbone',
      );
    }

    const {client, backbone} = await this.getOnedriveClient(tenant);

    const storagePath = await this.onedriveContentManager.computeStoragePath(
      tenant,
    );

    const rootPath = OnedriveContentManager.buildOnedrivePath(
      storagePath.driveId,
      storagePath.path,
    );

    await this.cleanupFolder(backbone, tenant, client, rootPath, 0, ctx);
  }

  private async cleanupFolder(
    backbone: OnedriveBackboneTenant,
    tenant: ClientTenant,
    client: Client,
    rootPath: string,
    level: number,
    ctx: CleanupContext,
  ) {
    this.logger.info('cleaning up folder ' + rootPath);

    const reqUrl = rootPath + ':/children';

    this.logger.info('listing ' + reqUrl);
    const listingResponse = await client.api(reqUrl).get();

    let listing = new MsGraphPageResponse<MicrosoftGraph.DriveItem>(
      listingResponse,
    );

    if (level > 0) {
      await this.checkIfFolderIsEmpty(
        backbone,
        tenant,
        client,
        rootPath,
        listing,
        ctx,
      );
    }

    let someRemoved = false;

    while (listing?.value?.length) {
      const files = listing.value.filter(i => !!i.file);
      const folders = listing.value.filter(i => !!i.folder);

      const fileChunks = ObjectUtils.chunkify(files, 100);

      for (const fileChunk of fileChunks) {
        const remoteIdsOnDb = await this.contentRepository.find({
          where: {
            onedriveId: {
              inq: fileChunk.map(i => i.id!),
            },
          },
        });
        const missingFiles = fileChunk.filter(
          c => !remoteIdsOnDb.find(c2 => c2.onedriveId === c.id),
        );
        for (const missingFile of missingFiles) {
          await this.processRemoteFileMissingOnDB(
            backbone,
            tenant,
            client,
            rootPath,
            missingFile,
            ctx,
          );
          someRemoved = true;
        }
      }

      for (const item of folders) {
        const itemPath = rootPath + '/' + item.name;
        await this.cleanupFolder(
          backbone,
          tenant,
          client,
          itemPath,
          level + 1,
          ctx,
        );
      }

      if (listing.nextLink) {
        this.logger.info('fetching next page');
        listing = new MsGraphPageResponse<MicrosoftGraph.DriveItem>(
          await client.api(listing.nextLink).get(),
        );
      } else {
        break;
      }
    }

    if (someRemoved) {
      await this.checkIfFolderIsEmpty(
        backbone,
        tenant,
        client,
        rootPath,
        undefined,
        ctx,
      );
    }
  }

  private async checkIfFolderIsEmpty(
    backbone: OnedriveBackboneTenant,
    tenant: ClientTenant,
    client: Client,
    rootPath: string,
    listing: MsGraphPageResponse<MicrosoftGraph.DriveItem> | undefined,
    ctx: CleanupContext,
  ): Promise<void> {
    if (!listing) {
      const reqUrl = rootPath + ':/children';
      this.logger.info('listing ' + reqUrl);
      const listingResponse = await client.api(reqUrl).get();

      listing = new MsGraphPageResponse<MicrosoftGraph.DriveItem>(
        listingResponse,
      );
    }

    if (!listing.count && !listing?.value?.length) {
      // EMPTY FOLDER
      this.logger.warn('*** FOUND EMPTY FOLDER: ' + rootPath);
      const itemResponse = (await client
        .api(rootPath)
        .get()) as MicrosoftGraph.DriveItem;
      if (!ctx.preview) {
        this.logger.debug('deleting empty folder ' + rootPath);
        await this.onedriveContentManager.deleteItem(
          client,
          backbone.driveId,
          ObjectUtils.require(itemResponse, 'id'),
        );
        this.logger.debug('deleted empty folder ' + rootPath);
      }
      ctx.deletedFolders!++;
      ctx.reclaimedSpace! += itemResponse.size ?? 0;
    }
  }

  private async processRemoteFileMissingOnDB(
    backbone: OnedriveBackboneTenant,
    tenant: ClientTenant,
    client: Client,
    rootPath: string,
    item: MicrosoftGraph.DriveItem,
    ctx: CleanupContext,
  ): Promise<void> {
    const itemPath = rootPath + '/' + item.name;
    this.logger.warn(
      '*** START OF MISSING REMOTE FILE PROCESSING: ' + itemPath,
    );

    // DELETE FILE
    if (!ctx.preview) {
      await this.onedriveContentManager.deleteItem(
        client,
        backbone.driveId,
        ObjectUtils.require(item, 'id'),
      );
    }
    ctx.deletedFiles!++;
    ctx.reclaimedSpace! += item.size ?? 0;
    this.logger.warn('*** END OF MISSING REMOTE FILE PROCESSING');
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
}
