import {service} from '@loopback/core';
import {cronJob} from '@loopback/cron';
import {juggler, repository} from '@loopback/repository';

import {
  ContentStatus,
  CronJobExecutionContext,
  OnedriveContent,
} from '../models';
import {
  ClientTenantRepository,
  OnedriveContentRepository,
  StorageNodeRepository,
} from '../repositories';
import {
  EntityResolverService,
  OnedriveContentManager,
  TransactionService,
} from '../services';
import {CronWrapperBridgeService} from '../services/cron/cron-wrapper-bridge.service';
import {ObjectUtils} from '../utils';
import {CronJobWrapper} from './wrapper.cronjob';

type OnedriveContentMigrator = (
  ctx: CronJobExecutionContext,
  content: OnedriveContent,
  tx?: juggler.Transaction,
) => Promise<void>;

@cronJob()
export class OnedriveContentMigratorCronJob extends CronJobWrapper {
  migrators: {[spec: string]: OnedriveContentMigrator} = {
    '3->4': this.migrate3to4,
  };

  constructor(
    @service(CronWrapperBridgeService)
    protected cronWrapperBridgeService: CronWrapperBridgeService,
    @service(OnedriveContentManager)
    protected contentManager: OnedriveContentManager,
    @repository(OnedriveContentRepository)
    private contentRepository: OnedriveContentRepository,
    @service(TransactionService)
    private transactionService: TransactionService,
    @service(EntityResolverService)
    private entityResolverService: EntityResolverService,
    @repository(StorageNodeRepository)
    private storageNodeRepository: StorageNodeRepository,
    @repository(ClientTenantRepository)
    private clientTenantRepository: ClientTenantRepository,
  ) {
    // every 15 minutes
    super(cronWrapperBridgeService, {
      name: 'OnedriveContentMigratorCronJob',
      schedule: '0 */15 * * * *',
    });
  }

  public async execute(ctx: CronJobExecutionContext): Promise<void> {
    const toMigrate = await this.contentRepository.findPage(
      {
        where: {
          and: [
            {
              status: ContentStatus.ACTIVE,
            },
            {
              engineVersion: {lt: this.contentManager.engineVersion},
            },
          ],
        },
        order: ['id ASC'],
      },
      {
        page: 0,
        size: 50,
      },
    );

    if (!toMigrate.hasContent) {
      this.logger.debug(`${this.logPrefix} found no contents to migrate`);
      return;
    }

    this.logger.info(
      `${this.logPrefix} found ${toMigrate.totalElements} contents to be migrated, processing ${toMigrate.numberOfElements}`,
    );

    let migratedCounter = 0;
    for (const record of toMigrate.content) {
      const migrator = this.findMigrator(record.engineVersion);
      if (!migrator) {
        this.reportWarning(
          ctx,
          'no migrator found to update from version ' + record.engineVersion,
        );
        continue;
      }

      await this.transactionService.inTransaction(async tx => {
        await this.applyMigration(
          ctx,
          record,
          migrator.toVersion,
          migrator.migrator,
          tx,
        );
      });
      migratedCounter++;
    }

    if (migratedCounter) {
      this.reportInfo(ctx, `migrated ${migratedCounter} physical contents`);
    }
  }

  private async applyMigration(
    ctx: CronJobExecutionContext,
    content: OnedriveContent,
    toVersion: number,
    migrator: OnedriveContentMigrator,
    transaction: juggler.Transaction,
  ): Promise<boolean> {
    const context =
      'migrating content ' +
      content.uuid +
      ' from version ' +
      content.engineVersion +
      ' to ' +
      toVersion;
    let success = false;
    let failure: Error | null = null;

    try {
      await migrator(ctx, content, transaction);
      success = true;
    } catch (err) {
      failure = err as Error;
    }

    if (success) {
      content.engineVersion = toVersion;
      await this.contentRepository.updateById(
        content.id,
        {
          engineVersion: content.engineVersion,
        },
        {transaction},
      );

      this.reportInfo(ctx, 'success ' + context);
    } else {
      this.reportError(ctx, 'error ' + context, failure as Error);
    }

    return success;
  }

  private findMigrator(
    fromVersion: number,
  ): {migrator: OnedriveContentMigrator; toVersion: number} | null {
    let attemptTarget = this.contentManager.engineVersion;
    while (attemptTarget > fromVersion) {
      const attemptSpec = '' + fromVersion + '->' + attemptTarget;
      const m = this.migrators[attemptSpec];
      if (m) {
        return {migrator: m, toVersion: attemptTarget};
      }
      attemptTarget--;
    }
    return null;
  }

  private async migrate3to4(
    ctx: CronJobExecutionContext,
    content: OnedriveContent,
    transaction?: juggler.Transaction,
  ): Promise<void> {
    const node = await this.storageNodeRepository.findById(
      ObjectUtils.requireNotNull(content.nodeId),
      {},
      {transaction},
    );
    const tenant = await this.clientTenantRepository.findById(
      ObjectUtils.requireNotNull(node.tenantId),
      {},
      {transaction},
    );

    // only the path has been updated
    const newPathSpec = await this.contentManager.computeStoragePath(
      tenant,
      node,
      content,
    );

    if (newPathSpec.path === content.onedrivePath) {
      // path is already correct
      return;
    }

    // fake migration
    return;
  }
}
