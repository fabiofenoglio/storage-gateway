/* eslint-disable @typescript-eslint/no-explicit-any */
import {Class} from '@loopback/repository';
import {
  Client,
  createRestAppClient,
} from '@loopback/testlab';

import {StorageGatewayApplication} from '../../';
import {CronJobWrapper} from '../../cronjobs/wrapper.cronjob';
import {
  AbstractBackbone,
  ClientTenant,
  ClientTenantBackbone,
  S3BackboneDialect,
} from '../../models';
import {
  DEFAULT_ENCRYPTION_ALGORITHM,
} from '../../models/crypto/crypto-models.model';
import {
  FilesystemContentRepository,
  OnedriveContentRepository,
  S3ContentRepository,
} from '../../repositories';
import {MetricService} from '../../services/metric.service';
import {ConfigurationUtils} from '../../utils/configuration-utils';

const enableIntegrationForMemory = true;
const enableIntegrationForFilesystem = true;
const enableIntegrationForOnedrive = false;
const enableIntegrationForS3OnIBM = false;
const enableIntegrationForS3OnGCP = false;
const enableIntegrationForS3OnOracle = false;
const enableIntegrationForS3OnBackblaze = false;
const enableIntegrationForS3OnMinio = false;

export const testConfig = ConfigurationUtils.buildConfiguration('acceptance');

export function enableIntegrationTests(): boolean {
  return process.argv.includes('--integration-tests');
}

export interface BackboneUnderTestConfiguration
  extends Partial<AbstractBackbone> {
  type: ClientTenantBackbone;
  s3Dialect?: S3BackboneDialect;
}

export interface TenantUnderTestConfiguration extends Partial<ClientTenant> {
  s3Dialect?: S3BackboneDialect;
}

export const backbonesUnderTest: BackboneUnderTestConfiguration[] = [
  {type: ClientTenantBackbone.MEMORY},
  ...(enableIntegrationTests()
    ? [
        ...(enableIntegrationForFilesystem
          ? [{type: ClientTenantBackbone.FILESYSTEM}]
          : []),
        ...(enableIntegrationForOnedrive
          ? [{type: ClientTenantBackbone.ONEDRIVE}]
          : []),
        ...(enableIntegrationForS3OnIBM
          ? [{type: ClientTenantBackbone.S3, s3Dialect: S3BackboneDialect.IBM}]
          : []),
        ...(enableIntegrationForS3OnGCP
          ? [{type: ClientTenantBackbone.S3, s3Dialect: S3BackboneDialect.GCP}]
          : []),
        ...(enableIntegrationForS3OnOracle
          ? [
              {
                type: ClientTenantBackbone.S3,
                s3Dialect: S3BackboneDialect.ORACLE,
              },
            ]
          : []),
        ...(enableIntegrationForS3OnBackblaze
          ? [
              {
                type: ClientTenantBackbone.S3,
                s3Dialect: S3BackboneDialect.BACKBLAZE,
              },
            ]
          : []),
        ...(enableIntegrationForS3OnMinio
          ? [
              {
                type: ClientTenantBackbone.S3,
                s3Dialect: S3BackboneDialect.MINIO,
              },
            ]
          : []),
      ]
    : []),
];

export const tenantConfigurationsUnderTest: TenantUnderTestConfiguration[] = [
  ...(!enableIntegrationTests() || enableIntegrationForMemory
    ? [
        {
          backboneId: 2,
          backboneType: ClientTenantBackbone.MEMORY,
          enableThumbnails: true,
          encryptionAlgorithm: DEFAULT_ENCRYPTION_ALGORITHM,
          name: 'Memory, with thumbs, with encryption',
          //code: 'memt000'
        },
        {
          backboneId: 2,
          backboneType: ClientTenantBackbone.MEMORY,
          enableThumbnails: false,
          encryptionAlgorithm: DEFAULT_ENCRYPTION_ALGORITHM,
          name: 'Memory, no thumbs, with encryption',
          //code: 'memt001'
        },
        {
          backboneId: 2,
          backboneType: ClientTenantBackbone.MEMORY,
          enableThumbnails: true,
          name: 'Memory, with thumbs, no encryption',
          //code: 'memt002'
        },
        {
          backboneId: 2,
          backboneType: ClientTenantBackbone.MEMORY,
          enableThumbnails: false,
          name: 'Memory',
          //code: 'memt003'
        },
      ]
    : []),
  ...(enableIntegrationTests() && enableIntegrationForFilesystem
    ? [
        {
          backboneType: ClientTenantBackbone.FILESYSTEM,
          enableThumbnails: true,
          encryptionAlgorithm: DEFAULT_ENCRYPTION_ALGORITHM,
          name: 'FS, with thumbs, with encryption',
          //code: 'fst000'
        },
        {
          backboneType: ClientTenantBackbone.FILESYSTEM,
          enableThumbnails: false,
          encryptionAlgorithm: DEFAULT_ENCRYPTION_ALGORITHM,
          name: 'FS, no thumbs, with encryption',
          //code: 'fst001'
        },
        {
          backboneType: ClientTenantBackbone.FILESYSTEM,
          enableThumbnails: true,
          name: 'FS, with thumbs, no encryption',
          //code: 'fst002'
        },
        {
          backboneType: ClientTenantBackbone.FILESYSTEM,
          enableThumbnails: false,
          name: 'FS, no thumbs, no encryption',
          //code: 'fst003'
        },
      ]
    : []),
  ...(enableIntegrationTests() && enableIntegrationForOnedrive
    ? [
        {
          backboneType: ClientTenantBackbone.ONEDRIVE,
          enableThumbnails: true,
          encryptionAlgorithm: DEFAULT_ENCRYPTION_ALGORITHM,
          name: 'OneDrive, with thumbs, with encryption',
          //code: 'fst000'
        },
        {
          backboneType: ClientTenantBackbone.ONEDRIVE,
          enableThumbnails: false,
          encryptionAlgorithm: DEFAULT_ENCRYPTION_ALGORITHM,
          name: 'OneDrive, no thumbs, with encryption',
          //code: 'fst001'
        },
        {
          backboneType: ClientTenantBackbone.ONEDRIVE,
          enableThumbnails: true,
          name: 'OneDrive, with thumbs, no encryption',
          //code: 'fst002'
        },
        {
          backboneType: ClientTenantBackbone.ONEDRIVE,
          enableThumbnails: false,
          name: 'OneDrive, no thumbs, no encryption',
          //code: 'fst003'
        },
      ]
    : []),
  ...(enableIntegrationTests() && enableIntegrationForS3OnIBM
    ? [
        {
          s3Dialect: S3BackboneDialect.IBM,
          backboneType: ClientTenantBackbone.S3,
          enableThumbnails: true,
          encryptionAlgorithm: DEFAULT_ENCRYPTION_ALGORITHM,
          name: 'S3 IBM, with thumbs, with encryption',
          //code: 'fst000'
        },
        {
          s3Dialect: S3BackboneDialect.IBM,
          backboneType: ClientTenantBackbone.S3,
          enableThumbnails: false,
          encryptionAlgorithm: DEFAULT_ENCRYPTION_ALGORITHM,
          name: 'S3 IBM, no thumbs, with encryption',
          //code: 'fst001'
        },
        {
          s3Dialect: S3BackboneDialect.IBM,
          backboneType: ClientTenantBackbone.S3,
          enableThumbnails: true,
          name: 'S3 IBM, with thumbs, no encryption',
          //code: 'fst002'
        },
        {
          s3Dialect: S3BackboneDialect.IBM,
          backboneType: ClientTenantBackbone.S3,
          enableThumbnails: false,
          name: 'S3 IBM, no thumbs, no encryption',
          //code: 'fst003'
        },
      ]
    : []),
  ...(enableIntegrationTests() && enableIntegrationForS3OnGCP
    ? [
        {
          s3Dialect: S3BackboneDialect.GCP,
          backboneType: ClientTenantBackbone.S3,
          enableThumbnails: false,
          encryptionAlgorithm: DEFAULT_ENCRYPTION_ALGORITHM,
          name: 'S3 GCP, no thumbs, with encryption',
          //code: 'fst003'
        },
      ]
    : []),
  ...(enableIntegrationTests() && enableIntegrationForS3OnOracle
    ? [
        {
          s3Dialect: S3BackboneDialect.ORACLE,
          backboneType: ClientTenantBackbone.S3,
          enableThumbnails: true,
          encryptionAlgorithm: DEFAULT_ENCRYPTION_ALGORITHM,
          name: 'S3 Oracle, no thumbs, with encryption',
          //code: 'fst003'
        },
      ]
    : []),
  ...(enableIntegrationTests() && enableIntegrationForS3OnBackblaze
    ? [
        {
          s3Dialect: S3BackboneDialect.BACKBLAZE,
          backboneType: ClientTenantBackbone.S3,
          enableThumbnails: false,
          encryptionAlgorithm: DEFAULT_ENCRYPTION_ALGORITHM,
          name: 'S3 Backblaze, no thumbs, with encryption',
          //code: 'fst003'
        },
      ]
    : []),
  ...(enableIntegrationTests() && enableIntegrationForS3OnMinio
    ? [
        {
          s3Dialect: S3BackboneDialect.MINIO,
          backboneType: ClientTenantBackbone.S3,
          enableThumbnails: true,
          encryptionAlgorithm: DEFAULT_ENCRYPTION_ALGORITHM,
          name: 'S3 MinIO, with thumbs, with encryption',
          //code: 'fst003'
        },
        {
          s3Dialect: S3BackboneDialect.MINIO,
          backboneType: ClientTenantBackbone.S3,
          enableThumbnails: false,
          encryptionAlgorithm: DEFAULT_ENCRYPTION_ALGORITHM,
          name: 'S3 MinIO, no thumbs, with encryption',
          //code: 'fst003'
        },
        {
          s3Dialect: S3BackboneDialect.MINIO,
          backboneType: ClientTenantBackbone.S3,
          enableThumbnails: true,
          name: 'S3 MinIO, with thumbs, no encryption',
          //code: 'fst003'
        },
        {
          s3Dialect: S3BackboneDialect.MINIO,
          backboneType: ClientTenantBackbone.S3,
          enableThumbnails: false,
          name: 'S3 MinIO, no thumbs, no encryption',
          //code: 'fst003'
        },
      ]
    : []),
];

export async function setupApplication(): Promise<AppWithClient> {
  const app = new StorageGatewayApplication({
    ...testConfig,
  });

  await app.boot();
  await app.start();

  const client = createRestAppClient(app);

  return {app, client};
}

export interface AppWithClient {
  app: StorageGatewayApplication;
  client: Client;
}

export function expectError(
  doing: () => {},
  errorThat: (err: Error) => boolean,
) {
  try {
    doing();
    throw new Error('Expected an error that did not happen');
  } catch (err) {
    if (errorThat(err)) {
      return;
    }
    console.warn(
      'Expected an error that satisfied the criteria, instead got an error that did not',
    );
    throw err;
  }
}

export async function sleep(duration: number): Promise<void> {
  if (duration <= 0) {
    return;
  }
  return new Promise(resolve => setTimeout(resolve, duration));
}

export async function getCronjob(
  app: StorageGatewayApplication,
  name: string,
): Promise<CronJobWrapper> {
  return app.get('cron.jobs.' + name);
}

export function getContentDeletionBatchBinding(
  bbType: ClientTenantBackbone,
): string {
  if (bbType === ClientTenantBackbone.FILESYSTEM) {
    return 'cron.jobs.FilesystemContentDeletionCronJob';
  } else if (bbType === ClientTenantBackbone.ONEDRIVE) {
    return 'cron.jobs.OnedriveContentDeletionCronJob';
  } else if (bbType === ClientTenantBackbone.S3) {
    return 'cron.jobs.S3ContentDeletionCronJob';
  } else {
    throw new Error('No job binding');
  }
}

export function getContentManagerBinding(bbType: ClientTenantBackbone): string {
  if (bbType === ClientTenantBackbone.FILESYSTEM) {
    return 'services.FilesystemContentManager';
  } else if (bbType === ClientTenantBackbone.ONEDRIVE) {
    return 'services.OnedriveContentManager';
  } else if (bbType === ClientTenantBackbone.MEMORY) {
    return 'services.InMemoryContentManager';
  } else if (bbType === ClientTenantBackbone.S3) {
    return 'services.S3ContentManager';
  } else {
    throw new Error('No job binding');
  }
}

export function getContentRepositoryBinding(
  bbType: ClientTenantBackbone,
): Class<any> {
  if (bbType === ClientTenantBackbone.FILESYSTEM) {
    return FilesystemContentRepository;
  } else if (bbType === ClientTenantBackbone.ONEDRIVE) {
    return OnedriveContentRepository;
  } else if (bbType === ClientTenantBackbone.S3) {
    return S3ContentRepository;
  } else {
    throw new Error('No job binding');
  }
}

export async function getMetricService(
  app: StorageGatewayApplication,
): Promise<MetricService> {
  return app.get('services.MetricService');
}
