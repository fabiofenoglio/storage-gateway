import {expect} from '@loopback/testlab';
import fs from 'fs';
import lodash from 'lodash';
import {v4 as uuidv4} from 'uuid';
import {StorageGatewayApplication} from '../..';
import {
  AbstractContent,
  ClientTenant,
  ClientTenantBackbone,
  FilesystemBackboneTenant,
  OnedriveBackboneTenant,
  S3BackboneAuthenticationSchema,
  S3BackboneDialect,
  S3BackboneTenant,
  StorageNode,
  StorageNodeMetadata,
  StorageNodeShare,
  StorageNodeShareType,
  StorageNodeType,
} from '../../models';
import {RawUploadDto} from '../../models/content/content-upload-dto.model';
import {
  ClientTenantRepository,
  FilesystemBackboneTenantRepository,
  MsGraphTokenRepository,
  OnedriveBackboneTenantRepository,
  S3BackboneTenantRepository,
  StorageNodeMetadataRepository,
  StorageNodeRepository,
  StorageNodeShareRepository,
} from '../../repositories';
import {ClientProfile, ContentService} from '../../services';
import {backbonesUnderTest, tenantConfigurationsUnderTest} from './test-helper';

export async function givenFilesystemBackbones(
  app: StorageGatewayApplication,
): Promise<FilesystemBackboneTenant> {
  const filesystemBackboneTenantRepository = await app.getRepository(
    FilesystemBackboneTenantRepository,
  );

  const testData = await getConfigurationData();

  const payload = {
    name: 'FS Backbone 1',
    relativePath: '/unit-test/bb1',
    ...testData.backbones.fs,
  };

  return (
    (await filesystemBackboneTenantRepository.findOne({
      where: {
        name: {
          eq: payload.name,
        },
      },
    })) ?? (await filesystemBackboneTenantRepository.create(payload))
  );
}

export async function givenOnedriveBackbones(
  app: StorageGatewayApplication,
): Promise<OnedriveBackboneTenant> {
  const tokenRepository = await app.getRepository(MsGraphTokenRepository);
  const repository = await app.getRepository(OnedriveBackboneTenantRepository);

  const testData = await getConfigurationData();

  const tokenPayload = {
    tokenType: 'Bearer',
    scope: 'Files.ReadWrite.All User.Read',
    userPrincipalId: 'OD_TOK_UT_001',
    associatedClient: 'client1',
    ...testData.msgraph.token,
  };

  const token =
    (await tokenRepository.findOne({
      where: {
        userPrincipalId: {
          eq: tokenPayload.userPrincipalId,
        },
      },
    })) ?? (await tokenRepository.create(tokenPayload));

  const payload = {
    name: 'OD Backbone 1',
    rootLocation: '/unit-test/bb1',
    ...testData.backbones.onedrive,
    ownerPrincipalId: token.userPrincipalId,
  };

  return (
    (await repository.findOne({
      where: {
        name: {
          eq: payload.name,
        },
      },
    })) ?? (await repository.create(payload))
  );
}

export async function givenS3IBMBackbones(
  app: StorageGatewayApplication,
): Promise<S3BackboneTenant> {
  const repository = await app.getRepository(S3BackboneTenantRepository);

  const testData = await getConfigurationData();

  const payload: Partial<S3BackboneTenant> = {
    name: 'S3 Backbone 1 (IBM)',
    dialect: S3BackboneDialect.IBM,
    authenticationSchema: S3BackboneAuthenticationSchema.HMAC,
    ...testData.backbones.ibm,
  };

  return (
    (await repository.findOne({
      where: {
        name: {
          eq: payload.name,
        },
      },
    })) ?? (await repository.create(payload))
  );
}

export async function givenS3GCPBackbones(
  app: StorageGatewayApplication,
): Promise<S3BackboneTenant> {
  const repository = await app.getRepository(S3BackboneTenantRepository);

  const testData = await getConfigurationData();

  const payload: Partial<S3BackboneTenant> = {
    name: 'S3 Backbone 2 (GCP)',
    endpoint: 'https://storage.googleapis.com',
    dialect: S3BackboneDialect.GCP,
    authenticationSchema: S3BackboneAuthenticationSchema.HMAC,
    ...testData.backbones.gcp,
  };

  return (
    (await repository.findOne({
      where: {
        name: {
          eq: payload.name,
        },
      },
    })) ?? (await repository.create(payload))
  );
}

export async function givenS3OracleBackbones(
  app: StorageGatewayApplication,
): Promise<S3BackboneTenant> {
  const repository = await app.getRepository(S3BackboneTenantRepository);

  const testData = await getConfigurationData();

  const payload: Partial<S3BackboneTenant> = {
    name: 'S3 Backbone 3 (Oracle)',
    dialect: S3BackboneDialect.ORACLE,
    authenticationSchema: S3BackboneAuthenticationSchema.HMAC,
    ...testData.backbones.oracle,
  };

  return (
    (await repository.findOne({
      where: {
        name: {
          eq: payload.name,
        },
      },
    })) ?? (await repository.create(payload))
  );
}

export async function givenS3BackblazeBackbones(
  app: StorageGatewayApplication,
): Promise<S3BackboneTenant> {
  const repository = await app.getRepository(S3BackboneTenantRepository);

  const testData = await getConfigurationData();

  const payload: Partial<S3BackboneTenant> = {
    name: 'S3 Backbone 4 (Backblaze)',
    dialect: S3BackboneDialect.BACKBLAZE,
    authenticationSchema: S3BackboneAuthenticationSchema.HMAC,
    ...testData.backbones.backblaze,
  };

  return (
    (await repository.findOne({
      where: {
        name: {
          eq: payload.name,
        },
      },
    })) ?? (await repository.create(payload))
  );
}

export async function givenS3MinioBackbones(
  app: StorageGatewayApplication,
): Promise<S3BackboneTenant> {
  const repository = await app.getRepository(S3BackboneTenantRepository);

  const testData = await getConfigurationData();

  const payload: Partial<S3BackboneTenant> = {
    name: 'S3 Backbone 5 (MinIO)',
    dialect: S3BackboneDialect.MINIO,
    authenticationSchema: S3BackboneAuthenticationSchema.HMAC,
    ...testData.backbones.minio,
  };

  return (
    (await repository.findOne({
      where: {
        name: {
          eq: payload.name,
        },
      },
    })) ?? (await repository.create(payload))
  );
}

export async function givenInMemoryTenants(
  app: StorageGatewayApplication,
  owner: ClientProfile | string,
): Promise<ClientTenant[]> {
  const clientTenantRepository = await app.getRepository(
    ClientTenantRepository,
  );
  const ownerString = typeof owner === 'string' ? owner : owner.code;

  return clientTenantRepository.createAll([
    {
      backboneId: 1,
      backboneType: ClientTenantBackbone.MEMORY,
      code: 'IMT' + ownerString.toUpperCase() + '001' + uuidv4(),
      engineVersion: 1,
      name: 'In-Memory Test tenant 1',
      ownerIdentifier: ownerString,
      rootLocation: '/imt' + ownerString.toLowerCase() + '001' + uuidv4(),
      enableThumbnails: true,
    },
    {
      backboneId: 1,
      backboneType: ClientTenantBackbone.MEMORY,
      code: 'IMT' + ownerString.toUpperCase() + '002' + uuidv4(),
      engineVersion: 2,
      name: 'In-Memory Test tenant 2',
      ownerIdentifier: ownerString,
      rootLocation: '/imt' + ownerString.toLowerCase() + '002' + uuidv4(),
      enableThumbnails: true,
    },
    {
      backboneId: 1,
      backboneType: ClientTenantBackbone.MEMORY,
      code: 'IMT' + ownerString.toUpperCase() + '003' + uuidv4(),
      engineVersion: 3,
      name: 'In-Memory Test tenant 3',
      ownerIdentifier: ownerString,
      rootLocation: '/imt' + ownerString.toLowerCase() + '003' + uuidv4(),
      enableThumbnails: true,
    },
  ]);
}

export async function givenMixedTenantConfigurations(
  app: StorageGatewayApplication,
  owner: ClientProfile | string,
): Promise<ClientTenant[]> {
  const types = [...tenantConfigurationsUnderTest];
  const backboneConfigs = [...backbonesUnderTest];

  const clientTenantRepository = await app.getRepository(
    ClientTenantRepository,
  );
  const ownerString = typeof owner === 'string' ? owner : owner.code;

  const fsBackbone = backboneConfigs.find(
    c => c.type === ClientTenantBackbone.FILESYSTEM,
  )
    ? await givenFilesystemBackbones(app)
    : null;

  const odBackbone = backboneConfigs.find(
    c => c.type === ClientTenantBackbone.ONEDRIVE,
  )
    ? await givenOnedriveBackbones(app)
    : null;

  const s3IBMBackbone = backboneConfigs.find(
    c =>
      c.type === ClientTenantBackbone.S3 &&
      c.s3Dialect === S3BackboneDialect.IBM,
  )
    ? await givenS3IBMBackbones(app)
    : null;

  const s3GCPBackbone = backboneConfigs.find(
    c =>
      c.type === ClientTenantBackbone.S3 &&
      c.s3Dialect === S3BackboneDialect.GCP,
  )
    ? await givenS3GCPBackbones(app)
    : null;

  const s3OracleBackbone = backboneConfigs.find(
    c =>
      c.type === ClientTenantBackbone.S3 &&
      c.s3Dialect === S3BackboneDialect.ORACLE,
  )
    ? await givenS3OracleBackbones(app)
    : null;

  const s3BackblazeBackbone = backboneConfigs.find(
    c =>
      c.type === ClientTenantBackbone.S3 &&
      c.s3Dialect === S3BackboneDialect.BACKBLAZE,
  )
    ? await givenS3BackblazeBackbones(app)
    : null;

  const s3MinioBackbone = backboneConfigs.find(
    c =>
      c.type === ClientTenantBackbone.S3 &&
      c.s3Dialect === S3BackboneDialect.MINIO,
  )
    ? await givenS3MinioBackbones(app)
    : null;

  const out: ClientTenant[] = [];

  const defaults: {[key: string]: () => Partial<ClientTenant>} = {
    [ClientTenantBackbone.MEMORY]: () => ({
      backboneId: 2,
      backboneType: ClientTenantBackbone.MEMORY,
      code: 'IMT' + ownerString.toUpperCase() + '-' + uuidv4(),
      engineVersion: 1,
      name: 'In-Memory Test tenant',
      ownerIdentifier: ownerString,
      rootLocation: '/imt' + ownerString.toLowerCase() + '-' + uuidv4(),
    }),
    [ClientTenantBackbone.FILESYSTEM]: () => ({
      backboneId: fsBackbone?.id,
      backboneType: ClientTenantBackbone.FILESYSTEM,
      code: 'FST' + ownerString.toUpperCase() + '-' + uuidv4(),
      engineVersion: 1,
      name: 'FileSystem Test tenant',
      ownerIdentifier: ownerString,
      rootLocation: '/fst' + ownerString.toLowerCase() + '-' + uuidv4(),
    }),
    [ClientTenantBackbone.ONEDRIVE]: () => ({
      backboneId: odBackbone?.id,
      backboneType: ClientTenantBackbone.ONEDRIVE,
      code: 'ODT' + ownerString.toUpperCase() + '-' + uuidv4(),
      engineVersion: 1,
      name: 'OneDrive Test tenant',
      ownerIdentifier: ownerString,
      rootLocation: '/odt' + ownerString.toLowerCase() + '-' + uuidv4(),
    }),
    [ClientTenantBackbone.S3 + '_' + S3BackboneDialect.IBM]: () => ({
      backboneId: s3IBMBackbone?.id,
      backboneType: ClientTenantBackbone.S3,
      code: 'S3-IBM-T' + ownerString.toUpperCase() + '-' + uuidv4(),
      engineVersion: 1,
      name: 'S3 Test tenant on IBM',
      ownerIdentifier: ownerString,
      rootLocation: 'storagegateway-test-acceptance-000',
    }),
    [ClientTenantBackbone.S3 + '_' + S3BackboneDialect.GCP]: () => ({
      backboneId: s3GCPBackbone?.id,
      backboneType: ClientTenantBackbone.S3,
      code: 'S3-GCP-T' + ownerString.toUpperCase() + '-' + uuidv4(),
      engineVersion: 1,
      name: 'S3 Test tenant on GCP',
      ownerIdentifier: ownerString,
      rootLocation: 'storagegateway-test-acceptance-000',
    }),
    [ClientTenantBackbone.S3 + '_' + S3BackboneDialect.ORACLE]: () => ({
      backboneId: s3OracleBackbone?.id,
      backboneType: ClientTenantBackbone.S3,
      code: 'S3-ORA-T' + ownerString.toUpperCase() + '-' + uuidv4(),
      engineVersion: 1,
      name: 'S3 Test tenant on Oracle',
      ownerIdentifier: ownerString,
      rootLocation: 'storagegateway-test-acceptance-000',
    }),
    [ClientTenantBackbone.S3 + '_' + S3BackboneDialect.BACKBLAZE]: () => ({
      backboneId: s3BackblazeBackbone?.id,
      backboneType: ClientTenantBackbone.S3,
      code: 'S3-BB-T' + ownerString.toUpperCase() + '-' + uuidv4(),
      engineVersion: 1,
      name: 'S3 Test tenant on Backblaze',
      ownerIdentifier: ownerString,
      rootLocation: 'storagegateway-test-acceptance-000',
    }),
    [ClientTenantBackbone.S3 + '_' + S3BackboneDialect.MINIO]: () => ({
      backboneId: s3MinioBackbone?.id,
      backboneType: ClientTenantBackbone.S3,
      code: 'S3-MinIO-T' + ownerString.toUpperCase() + '-' + uuidv4(),
      engineVersion: 1,
      name: 'S3 Test tenant on MinIO',
      ownerIdentifier: ownerString,
      rootLocation: 'storagegateway-test-acceptance-000',
    }),
  };

  for (const config of types) {
    const dto = {
      ...defaults[
        config.backboneType! + (config.s3Dialect ? '_' + config.s3Dialect : '')
      ](),
      ...config,
    };
    dto.id = undefined;

    delete dto.s3Dialect;

    if (!dto.backboneId) {
      // something's wrong
      throw new Error('Invalid tenant test configuration');
    }

    const created = await clientTenantRepository.create(new ClientTenant(dto));
    config.id = created.id;
    out.push(created);
  }

  return out;
}

export async function givenSomeNodes(
  app: StorageGatewayApplication,
  tenant: ClientTenant,
  number = 5,
  maxLevel = 2,
  parentNode: StorageNode | undefined = undefined,
  level: number | undefined = 0,
): Promise<StorageNode[]> {
  const storageNodeRepository = await app.getRepository(StorageNodeRepository);
  level = level ?? 0;
  const output: StorageNode[] = [];
  const now = new Date();

  const baseData: Partial<StorageNode> = {
    createdAt: now,
    createdBy: tenant.ownerIdentifier,
    engineVersion: 1,
    version: 1,
    uuid: uuidv4(),
    tenantId: tenant.id,
    parentId: parentNode?.id,
    parentUuid: parentNode?.uuid,
    status: 'ACTIVE',
  };

  for (let i = 0; i < number / 2; i++) {
    const folder = await storageNodeRepository.create(
      new StorageNode({
        ...baseData,
        type: StorageNodeType.FOLDER,
        name: 'folder' + level + i,
        uuid: uuidv4(),
      }),
    );

    output.push(folder);

    if (level < maxLevel) {
      await givenSomeNodes(app, tenant, number, maxLevel, folder, level + 1);
    }
  }

  for (let i = 0; i < number / 2; i++) {
    const file = await storageNodeRepository.create(
      new StorageNode({
        ...baseData,
        type: StorageNodeType.FILE,
        name: 'file' + level + i + '.bin',
        uuid: uuidv4(),
      }),
    );

    output.push(file);
  }

  return output;
}

export async function givenFile(
  app: StorageGatewayApplication,
  parent: StorageNode | ClientTenant,
  data?: Partial<StorageNode>,
) {
  return givenNode(app, parent, {
    type: StorageNodeType.FILE,
    name: 'file-' + uuidv4(),
    ...data,
  });
}

export async function givenFolder(
  app: StorageGatewayApplication,
  parent: StorageNode | ClientTenant,
  data?: Partial<StorageNode>,
) {
  return givenNode(app, parent, {
    type: StorageNodeType.FOLDER,
    name: 'folder-' + uuidv4(),
    ...data,
  });
}

export async function givenNode(
  app: StorageGatewayApplication,
  parent: StorageNode | ClientTenant,
  data?: Partial<StorageNode>,
): Promise<StorageNode> {
  const storageNodeRepository = await app.getRepository(StorageNodeRepository);
  const clientTenantRepository = await app.getRepository(
    ClientTenantRepository,
  );
  const now = new Date();
  const tenant =
    parent instanceof ClientTenant
      ? parent
      : await clientTenantRepository.findById(parent.tenantId);
  const parentNode = parent instanceof StorageNode ? parent : null;

  const baseData: Partial<StorageNode> = {
    createdAt: now,
    createdBy: tenant.ownerIdentifier,
    engineVersion: 1,
    version: 1,
    uuid: uuidv4(),
    tenantId: tenant.id,
    parentId: parentNode?.id,
    parentUuid: parentNode?.uuid,
    type: StorageNodeType.FILE,
    name: 'file-' + uuidv4(),
    status: 'ACTIVE',
    ...(data ?? {}),
  };

  return storageNodeRepository.create(
    new StorageNode({
      ...baseData,
    }),
  );
}

export async function givenNodeTree(
  app: StorageGatewayApplication,
  parent: StorageNode | ClientTenant,
  spec: (NodeTreeSpecification | string)[],
): Promise<NodeTreeSpecification[]> {
  const output: NodeTreeSpecification[] = [];
  for (let specNode of spec) {
    if (typeof specNode === 'string') {
      specNode = {
        name: specNode,
      };
    }
    if (!specNode.type) {
      if (specNode.children?.length) {
        specNode.type = StorageNodeType.FOLDER;
      } else {
        specNode.type = StorageNodeType.FILE;
      }
    }
    const created = await givenNode(app, parent, {
      name: specNode.name,
      type: specNode.type,
    });
    specNode.node = created;
    output.push(specNode);

    if (specNode.children?.length) {
      specNode.children = await givenNodeTree(app, created, specNode.children);
    }
  }
  return output;
}

export async function givenSomeMetadata(
  app: StorageGatewayApplication,
  tenant: ClientTenant,
  parentNode: StorageNode,
  number = 5,
): Promise<StorageNodeMetadata[]> {
  const storageNodeMetadataRepository = await app.getRepository(
    StorageNodeMetadataRepository,
  );
  const output: StorageNodeMetadata[] = [];
  const now = new Date();
  const values = ['value', 123, {a: 1, b: 2}];

  const baseData: Partial<StorageNodeMetadata> = {
    createdAt: now,
    createdBy: tenant.ownerIdentifier,
    engineVersion: 1,
    version: 1,
    nodeId: parentNode?.id,
  };

  for (let i = 0; i < number; i++) {
    const folder = await storageNodeMetadataRepository.create(
      new StorageNodeMetadata({
        ...baseData,
        key: 'metadata' + i,
        value: values[i % 3],
      }),
    );

    output.push(folder);
  }

  return output;
}

export async function givenMetadata(
  app: StorageGatewayApplication,
  parentNode: StorageNode,
  data?: Partial<StorageNodeMetadata>,
): Promise<StorageNodeMetadata> {
  const storageNodeMetadataRepository = await app.getRepository(
    StorageNodeMetadataRepository,
  );
  const now = new Date();

  const baseData: Partial<StorageNodeMetadata> = {
    createdAt: now,
    createdBy: parentNode.createdBy,
    engineVersion: 1,
    version: 1,
    nodeId: parentNode?.id,
    key: 'metadata-' + uuidv4(),
    value: uuidv4(),
    ...(data ?? {}),
  };

  return storageNodeMetadataRepository.create(
    new StorageNodeMetadata({
      ...baseData,
    }),
  );
}

export async function givenSomeContent(
  app: StorageGatewayApplication,
  tenant: ClientTenant,
  node: StorageNode,
  content?: {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
  },
): Promise<{
  content: AbstractContent;
  payload: Buffer;
}> {
  const contentService: ContentService = await app.get(
    'services.ContentService',
  );
  expect(contentService).to.not.be.undefined();

  const bytes = [];
  for (let i = 0; i < 500; i++) {
    bytes.push(Math.round(Math.random() * 255));
  }

  const payload = content?.buffer ?? Buffer.from(bytes);
  const uploadContent: RawUploadDto = {
    fields: {},
    files: [
      {
        size: payload.length,
        content: payload,
        mimetype: content?.mimeType ?? 'application/octet-stream',
        originalname: content?.fileName ?? 'testfile.bin',
      },
    ],
  };

  const created = await contentService.createContent(
    tenant,
    node,
    uploadContent,
  );

  return {
    content: created.entity,
    payload,
  };
}

export async function givenSomeShare(
  app: StorageGatewayApplication,
  tenant: ClientTenant,
  parentNode: StorageNode,
  number = 5,
): Promise<StorageNodeShare[]> {
  const storageNodeShareRepository = await app.getRepository(
    StorageNodeShareRepository,
  );
  const output: StorageNodeShare[] = [];
  const now = new Date();

  const baseData = {
    type: StorageNodeShareType.EMBED,
    createdAt: now,
    createdBy: tenant.ownerIdentifier,
    engineVersion: 1,
    version: 1,
    nodeId: parentNode.id!,
  };

  for (let i = 0; i < number; i++) {
    const folder = await storageNodeShareRepository.create(
      storageNodeShareRepository.new({
        ...baseData,
      }),
    );

    output.push(folder);
  }

  return output;
}

export async function givenShare(
  app: StorageGatewayApplication,
  parentNode: StorageNode,
  data?: Partial<StorageNodeShare>,
): Promise<StorageNodeShare> {
  const storageNodeShareRepository = await app.getRepository(
    StorageNodeShareRepository,
  );
  const now = new Date();

  const baseData: Partial<StorageNodeShare> = storageNodeShareRepository.new({
    type: StorageNodeShareType.EMBED,
    createdAt: now,
    createdBy: parentNode.createdBy,
    engineVersion: 1,
    version: 1,
    nodeId: parentNode.id!,
    ...data,
  });

  return storageNodeShareRepository.create(
    new StorageNodeShare({
      ...baseData,
    }),
  );
}

export async function deletingShare(
  app: StorageGatewayApplication,
  entity: StorageNodeShare,
) {
  const storageNodeShareRepository = await app.getRepository(
    StorageNodeShareRepository,
  );
  await storageNodeShareRepository.delete(entity);
}

export async function getResource(name: string): Promise<Buffer> {
  return fs.readFileSync('./src/__tests__/resources/' + name);
}

export async function readConfigurationFromFile(
  name: string,
): Promise<object | null> {
  const fullpath = './src/__tests__/data/' + name;
  if (!fs.existsSync(fullpath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(fullpath).toString());
}

export async function getResourceWithMetadata(
  name: string,
): Promise<TestResourceWithMetadata> {
  const content = await getResource(name);
  const metadata = await getResourceMetadata(name);

  return {content, metadata};
}

export async function getResourceMetadata(
  name: string,
): Promise<TestResourceMetadata> {
  return JSON.parse((await getResource(name + '.metadata.json')).toString());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getConfigurationData(): Promise<any> {
  const base = (await readConfigurationFromFile('test-data.sample.json')) ?? {};
  const merge = (await readConfigurationFromFile('test-data.json')) ?? {};
  const merged = lodash.merge(base, merge);
  expect(merged).to.not.be.undefined();
  expect(merged).to.not.be.null();
  return merged;
}

export interface TestResourceWithMetadata {
  content: Buffer;
  metadata: TestResourceMetadata;
}

export interface TestResourceMetadata {
  md5?: string;
  sha1?: string;
  sha256?: string;
  size?: number;
  mimeType?: string;
  fileName?: string;
}

export interface NodeTreeSpecification {
  name: string;
  type?: StorageNodeType;
  children?: NodeTreeSpecification[];
  node?: StorageNode;
}
