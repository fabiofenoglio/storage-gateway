/* eslint-disable @typescript-eslint/no-explicit-any */
import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {
  AbstractContent,
  ClientTenant,
  ClientTenantBackbone,
  StorageNode,
  StorageNodeType,
} from '../../../models';
import {supportedHashesList} from '../../../models/content/content-upload-dto.model';
import {GetNodeResponse, UpdateContentResponse} from '../../../rest';
import {Constants, ObjectUtils} from '../../../utils';
import {
  getResource,
  getResourceWithMetadata,
  givenInMemoryTenants,
  givenMixedTenantConfigurations,
  givenSomeContent,
  givenSomeNodes,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {
  getMetricService,
  setupApplication,
  tenantConfigurationsUnderTest,
} from '../../helper/test-helper';

describe('Update content', function () {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let mixedTenants: ClientTenant[];
  const defaultContent: {
    [key: string]: {content: AbstractContent; payload: Buffer};
  } = {};
  const rootNodes: {[key: string]: StorageNode[]} = {};
  const defaultNode: {[key: string]: StorageNode} = {};

  const key = (tenant: ClientTenant) => {
    return ObjectUtils.require(tenant, 'id');
  };

  const findTenant = (config: Partial<ClientTenant>) => {
    const tenant = mixedTenants.find(c => c.id === config.id);
    if (!tenant) {
      throw new Error('could not find test tenant of id ' + config.id);
    }
    return tenant;
  };

  const url = (tenant: ClientTenant | string, uuid: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid +
    '/content';

  const nodeUrl = (tenant: ClientTenant | string, uuid: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid;

  const assetUrl = (
    tenant: ClientTenant | string,
    uuid: string,
    assetKey: string,
  ) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid +
    '/assets/' +
    assetKey;

  const defaultFileContent = Buffer.from([1, 2, 3, 4, 5, 6, 99]);
  const defaultPayload = {
    field: 'file',
    content: defaultFileContent,
    options: {
      filename: 'test (updated).txt',
      contentType: 'application/octet-stream',
    },
  };

  const fetch = async (tenant: ClientTenant | string, uuid: string) =>
    (
      (
        await client
          .get(nodeUrl(tenant, uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect('Content-Type', /application\/json/)
          .expect(200)
      ).body as GetNodeResponse
    ).content;

  const fetchContent = async (tenant: ClientTenant | string, uuid: string) =>
    client
      .get(url(tenant, uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .redirects(2)
      .expect(200);

  const fetchContentAsset = async (
    tenant: ClientTenant | string,
    uuid: string,
    assetKey: string,
  ) =>
    client
      .get(assetUrl(tenant, uuid, assetKey))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(200);

  const deleteNodeContent = async (
    tenant: ClientTenant | string,
    uuid: string,
    opt?: {failsafe?: boolean},
  ) => {
    const res = await client
      .del(url(tenant, uuid))
      .set(principal.authHeaderName, principal.authHeaderValue);

    if (!opt?.failsafe) {
      expect(res.status).to.equal(204);
    }
    return res;
  };

  before('setupApplication', async function () {
    ({app, client} = await setupApplication());
    principal = givenPrincipal();
    mixedTenants = await givenMixedTenantConfigurations(app, principal.profile);

    for (const t of mixedTenants) {
      const k = key(t);

      // populate default tenant
      rootNodes[k] = await givenSomeNodes(app, t, 12);
      expect(rootNodes[k].length).to.be.greaterThan(0);

      defaultNode[k] = rootNodes[k].find(o => o.type === StorageNodeType.FILE)!;
      expect(defaultNode[k]).to.not.be.undefined();

      defaultContent[k] = await givenSomeContent(app, t, defaultNode[k]);
      for (const rootFile of rootNodes[k].filter(
        o => o.type === StorageNodeType.FILE,
      )) {
        if (rootFile.id === defaultNode[k].id) {
          continue;
        }
        await givenSomeContent(app, t, rootFile);
      }
    }
  });

  after(async () => {
    for (const nodes of Object.values(rootNodes)) {
      const t = mixedTenants.find(c => c.id === nodes[0].tenantId)!;
      for (const node of nodes) {
        await deleteNodeContent(t, node.uuid, {failsafe: true});
      }
    }
    await app.stop();
  });

  for (const tenantConfig of tenantConfigurationsUnderTest) {
    it(
      tenantConfig.name + ' - should return 401 without authorization',
      async () => {
        const t = findTenant(tenantConfig);
        const existing = await fetch(t, defaultNode[key(t)].uuid);
        expect(existing?.originalName).to.not.be.undefined();

        await client
          .put(url(t, defaultNode[key(t)]!.uuid))
          .attach(
            defaultPayload.field,
            defaultPayload.content,
            defaultPayload.options,
          )
          .field(
            'data',
            JSON.stringify({
              ...defaultPayload.options,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(401);
      },
    );

    it(
      tenantConfig.name + ' - should return 403 on not-owned tenants',
      async () => {
        const otherTenants = await givenInMemoryTenants(app, 'otherOwner');
        const otherNodes = await givenSomeNodes(app, otherTenants[0]);
        expect(otherNodes.length).to.be.greaterThan(0);
        const otherFile = otherNodes.find(
          o => o.type === StorageNodeType.FILE,
        )!;
        await givenSomeContent(app, otherTenants[0], otherFile);

        await client
          .put(url(otherTenants[0], otherFile.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(
            defaultPayload.field,
            defaultPayload.content,
            defaultPayload.options,
          )
          .field(
            'data',
            JSON.stringify({
              ...defaultPayload.options,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(403);
      },
    );

    it(
      tenantConfig.name + ' - should return 404 on missing tenants',
      async () => {
        const t = findTenant(tenantConfig);
        const existing = await fetch(t, defaultNode[key(t)].uuid);
        expect(existing?.originalName).to.not.be.undefined();

        await client
          .put(url('MISSINGTENANT', defaultNode[key(t)]!.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(
            defaultPayload.field,
            defaultPayload.content,
            defaultPayload.options,
          )
          .field(
            'data',
            JSON.stringify({
              ...defaultPayload.options,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(404);
      },
    );

    it(tenantConfig.name + ' - should return 404 on missing uuid', async () => {
      const t = findTenant(tenantConfig);
      await client
        .put(url(t, 'missinguuid'))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .attach(
          defaultPayload.field,
          defaultPayload.content,
          defaultPayload.options,
        )
        .field(
          'data',
          JSON.stringify({
            ...defaultPayload.options,
          }),
        )
        .expect('Content-Type', /application\/json/)
        .expect(404);
    });

    it(
      tenantConfig.name +
        ' - should return 400 when called with bad tenant code',
      async () => {
        const t = findTenant(tenantConfig);
        const existing = await fetch(t, defaultNode[key(t)].uuid);
        expect(existing?.originalName).to.not.be.undefined();

        const malformedCodes = ['\\..\\', 'TENANT!', 'tenànt', ' ' + t.code];
        for (const code of malformedCodes) {
          await client
            .put(url(code, defaultNode[key(t)]!.uuid))
            .set(principal.authHeaderName, principal.authHeaderValue)
            .attach(
              defaultPayload.field,
              defaultPayload.content,
              defaultPayload.options,
            )
            .field(
              'data',
              JSON.stringify({
                ...defaultPayload.options,
              }),
            )
            .expect('Content-Type', /application\/json/)
            .expect(400);
        }
      },
    );

    it(
      tenantConfig.name + ' - should return 400 when called with bad node uuid',
      async () => {
        const t = findTenant(tenantConfig);
        const malformedCodes = [
          '..',
          '\\..\\',
          'UUID!',
          'uùid',
          ' ' + rootNodes[key(t)][0].uuid,
        ];
        for (const code of malformedCodes) {
          await client
            .put(url(t, code))
            .set(principal.authHeaderName, principal.authHeaderValue)
            .attach(
              defaultPayload.field,
              defaultPayload.content,
              defaultPayload.options,
            )
            .field(
              'data',
              JSON.stringify({
                ...defaultPayload.options,
              }),
            )
            .expect('Content-Type', /application\/json/)
            .expect(400);
        }
      },
    );

    it(tenantConfig.name + ' - should return 200 OK', async () => {
      const t = findTenant(tenantConfig);
      const target = rootNodes[key(t)].filter(
        o => o.type === StorageNodeType.FILE,
      )[0];
      const existing = await fetch(t, target.uuid);
      expect(existing?.originalName).to.not.be.undefined();

      await client
        .put(url(t, target.uuid))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .attach(
          defaultPayload.field,
          defaultPayload.content,
          defaultPayload.options,
        )
        .field(
          'data',
          JSON.stringify({
            ...defaultPayload.options,
          }),
        )
        .expect('Content-Type', /application\/json/)
        .expect(200);
    });

    it(
      tenantConfig.name +
        ' - should process a sample PNG file and create thumbnails according to tenant configuration',
      async () => {
        const t = findTenant(tenantConfig);
        if (
          t.backboneType === ClientTenantBackbone.ONEDRIVE &&
          t.enableThumbnails &&
          !t.encryptionAlgorithm
        ) {
          // generated from onedrive
          return;
        }

        const metrics = await getMetricService(app);
        metrics.delta();

        const target = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[5];
        const existing = await fetch(t, target.uuid);
        expect(existing?.originalName).to.not.be.undefined();

        const payload = {
          field: 'file',
          content: await getResource('sample-png.png'),
          options: {
            filename: 'sample-png.png',
            contentType: 'image/png',
          },
        };

        const createContentResponse = await client
          .put(url(t, target.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .field(
            'data',
            JSON.stringify({
              ...payload.options,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(200);

        // check backbone calls metrics
        const delta = metrics.delta();
        if (t.backboneType === ClientTenantBackbone.FILESYSTEM) {
          expect(delta.externalWriteWithDataNumber).to.eql(
            1 + (t.enableThumbnails ? 1 : 0),
          );
        } else if (t.backboneType === ClientTenantBackbone.ONEDRIVE) {
          expect(delta.externalWriteWithDataNumber).to.eql(
            1 + (t.enableThumbnails && t.encryptionAlgorithm ? 1 : 0),
          );
        } else if (t.backboneType === ClientTenantBackbone.S3) {
          expect(delta.externalWriteWithDataNumber).to.eql(
            1 + (t.enableThumbnails ? 1 : 0),
          );
        }

        const createdContent = await fetchContent(t, target.uuid);

        const response = createContentResponse.body as UpdateContentResponse;

        expect(createdContent.status).to.equal(200);
        expect(createdContent.body).to.not.be.undefined();

        expect(createdContent.headers['content-type']).to.startWith(
          payload.options.contentType,
        );
        expect(createdContent.headers['content-length']).to.equal(
          payload.content.length + '',
        );

        expect(payload.content.compare(createdContent.body)).to.equal(0);
        expect(createdContent.body.compare(createdContent.body)).to.equal(0);

        // it should create some thumbnails
        expect(response.metadata?.image).to.not.be.undefined();

        if (t.enableThumbnails) {
          expect(
            response.metadata?.image?.thumbnails?.length,
          ).to.be.greaterThan(0);
          const firstThumbnail = response.metadata!.image!.thumbnails![0];

          // it should fetch the thumbnail
          const fetchedThumbnail = await fetchContentAsset(
            t,
            target.uuid,
            firstThumbnail.assetKey,
          );
          expect(fetchedThumbnail.status).to.equal(200);
          expect(fetchedThumbnail.body).to.not.be.undefined();
          expect(fetchedThumbnail.headers['content-type']).to.startWith(
            'image/',
          );
          expect(
            fetchedThumbnail.headers['content-length'],
          ).to.not.be.undefined();
        } else {
          expect(response.metadata?.image?.thumbnails?.length ?? 0).to.eql(0);
        }

        // check if tenant requires encryption
        if (t.encryptionAlgorithm) {
          expect(response.encryption?.algorithm).to.eql(t.encryptionAlgorithm);
          expect(Object.keys(response.encryption!).length).to.eql(1);
          expect(response.encryption).to.not.have.property('key');
          expect(response.encryption).to.not.have.property('iv');
          expect(response.encryption).to.not.have.property('auth');
        } else {
          expect(response.encryption?.algorithm).to.be.undefined();
        }

        await deleteNodeContent(t, target.uuid);
      },
    );

    it(
      tenantConfig.name + ' - should return all properties and hide privates',
      async () => {
        const t = findTenant(tenantConfig);
        const target = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[1];
        const payload = {
          ...defaultPayload,
        };

        const existing = await fetch(t, target.uuid)!;
        expect(existing).to.not.have.property('uuid');
        expect(existing?.originalName).to.not.be.undefined();

        const res = await client
          .put(url(t, target.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .field(
            'data',
            JSON.stringify({
              ...payload.options,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(200);

        const response = res.body as UpdateContentResponse;

        // should have uuid
        expect(response.key).to.equal(Constants.CONTENT.DEFAULT_KEY);
        expect(response.originalName).to.equal(payload.options.filename);
        expect(response.contentSize).to.equal(payload.content.length);
        expect(response).to.not.have.property('uuid');
        expect(response).to.have.property('encoding');
        expect(response).to.have.property('mimeType');
        expect(response.mimeType).to.equal(payload.options.contentType);

        // check audit
        expect(response.audit.version).to.equal(2);
        expect(response.audit.createdBy).to.not.be.undefined();
        expect(response.audit.modifiedBy).to.equal(principal.profile.code);
        expect(
          new Date(response.audit.createdAt).getTime(),
        ).to.be.lessThanOrEqual(new Date().getTime());
        expect(
          new Date(response.audit.modifiedAt!).getTime(),
        ).to.be.lessThanOrEqual(new Date().getTime());

        // should hide private properties
        expect(response).to.not.have.property('id');
        expect(response).to.not.have.property('version');

        // check if tenant requires encryption
        if (t.encryptionAlgorithm) {
          expect(response.encryption?.algorithm).to.eql(t.encryptionAlgorithm);
          expect(Object.keys(response.encryption!).length).to.eql(1);
          expect(response.encryption).to.not.have.property('key');
          expect(response.encryption).to.not.have.property('iv');
          expect(response.encryption).to.not.have.property('auth');
        } else {
          expect(response.encryption?.algorithm).to.be.undefined();
        }
      },
    );

    it(
      tenantConfig.name + ' - should increase version and handle audit fields',
      async () => {
        const t = findTenant(tenantConfig);
        const target = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[2];
        const payload = {
          ...defaultPayload,
        };

        const existing = await fetch(t, target.uuid);
        expect(existing?.originalName).to.not.be.undefined();

        expect(existing!.audit.version).to.equal(
          1,
          'starting version should be 1',
        );
        expect(existing!.audit.modifiedBy).to.be.undefined();
        expect(existing!.audit.modifiedAt).to.be.undefined();

        const res = await client
          .put(url(t, target.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .field(
            'data',
            JSON.stringify({
              ...payload.options,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(200);

        const response = res.body as UpdateContentResponse;

        // check audit
        expect(response.audit.version).to.equal(
          2,
          'updated version should be 2',
        );
        expect(response.audit.createdBy).to.not.be.undefined();
        expect(
          new Date(response.audit.createdAt).getTime(),
        ).to.be.lessThanOrEqual(new Date().getTime());
        expect(
          new Date(response.audit.modifiedAt!).getTime(),
        ).to.be.lessThanOrEqual(new Date().getTime());
        expect(response.audit.modifiedBy).to.equal(principal.profile.code);
      },
    );

    it(tenantConfig.name + ' - should actually update the data', async () => {
      const t = findTenant(tenantConfig);
      const target = rootNodes[key(t)].filter(
        o => o.type === StorageNodeType.FILE,
      )[3];
      const payload = {
        ...defaultPayload,
      };

      const existing = await fetch(t, target.uuid);
      expect(existing?.originalName).to.not.be.undefined();

      const res = await client
        .put(url(t, target.uuid))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .attach(payload.field, payload.content, payload.options)
        .field(
          'data',
          JSON.stringify({
            ...payload.options,
          }),
        )
        .expect('Content-Type', /application\/json/)
        .expect(200);

      const response = res.body as UpdateContentResponse;
      const updated = await fetch(t, defaultNode[key(t)].uuid);
      expect(updated?.originalName).to.not.be.undefined();

      // check audit
      expect(response.originalName).to.deepEqual(payload.options.filename);
      expect(updated!.originalName).to.deepEqual(payload.options.filename);
    });

    it(
      tenantConfig.name + ' - should actually update the physical content',
      async () => {
        const t = findTenant(tenantConfig);
        const target = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[4];
        const payload = {
          ...defaultPayload,
        };

        const existing = await fetch(t, target.uuid);
        expect(existing?.originalName).to.not.be.undefined();

        const existingContent = await fetchContent(t, target.uuid);
        expect(existingContent.status).to.equal(200);
        expect(existingContent.body).to.not.be.undefined();

        expect(payload.content.compare(existingContent.body)).to.not.equal(0);
        expect(existingContent.body.compare(existingContent.body)).to.equal(0);

        await client
          .put(url(t, target.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .field(
            'data',
            JSON.stringify({
              ...payload.options,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(200);

        const updatedContent = await fetchContent(t, target.uuid);
        expect(updatedContent.status).to.equal(200);
        expect(updatedContent.body).to.not.be.undefined();

        if (t.backboneType !== 'ONEDRIVE') {
          expect(updatedContent.headers['content-type']).to.startWith(
            payload.options.contentType,
          );
          expect(updatedContent.headers['content-length']).to.equal(
            payload.content.length + '',
          );
          expect(payload.content.compare(updatedContent.body)).to.equal(0);
          expect(updatedContent.body.compare(updatedContent.body)).to.equal(0);
          expect(
            existingContent.body.compare(updatedContent.body),
          ).to.not.equal(0);
        } else {
          expect(
            parseInt(updatedContent.headers['content-length'], 10),
          ).to.be.greaterThanOrEqual(payload.content.length);
        }
      },
    );

    it(
      tenantConfig.name +
        ' - should compute the default sha1 checksum when none passed',
      async function () {
        const t = findTenant(tenantConfig);
        const target = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[4];

        const existing = await fetch(t, target.uuid);
        expect(existing?.originalName).to.not.be.undefined();

        const existingContent = await fetchContent(t, target.uuid);
        expect(existingContent.status).to.equal(200);
        expect(existingContent.body).to.not.be.undefined();

        const testResource = await getResourceWithMetadata('sample-png.png');
        const payload = {
          field: 'file',
          content: testResource.content,
          options: {
            filename: 'sample-png.png',
            contentType: 'image/png',
          },
        };

        const createContentResponse = await client
          .put(url(t, target.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .field(
            'data',
            JSON.stringify({
              ...payload.options,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(200);

        const createdContent = await fetchContent(t, target.uuid);

        const response = createContentResponse.body as UpdateContentResponse;

        expect(createdContent.status).to.equal(200);
        expect(createdContent.body).to.not.be.undefined();

        expect(response.metadata?.hashes?.sha1).to.not.be.undefined();
        expect(response.metadata?.hashes?.sha1).to.equal(
          testResource.metadata.sha1,
        );
      },
    );

    for (const csType of supportedHashesList) {
      it(
        tenantConfig.name +
          ' - should compute the ' +
          csType +
          ' checksum when a control one is passed',
        async function () {
          const t = findTenant(tenantConfig);
          const target = rootNodes[key(t)].filter(
            o => o.type === StorageNodeType.FILE,
          )[4];

          const existing = await fetch(t, target.uuid);
          expect(existing?.originalName).to.not.be.undefined();

          const existingContent = await fetchContent(t, target.uuid);
          expect(existingContent.status).to.equal(200);
          expect(existingContent.body).to.not.be.undefined();

          const testResource = await getResourceWithMetadata('sample-png.png');
          expect(testResource.metadata[csType]).to.not.be.undefined();
          const correctHash = testResource.metadata[csType] + '';

          const payload = {
            field: 'file',
            content: testResource.content,
            options: {
              filename: 'sample-png.png',
              contentType: 'image/png',
            },
          };

          const res = await client
            .put(url(t, target.uuid))
            .set(principal.authHeaderName, principal.authHeaderValue)
            .attach(payload.field, payload.content, payload.options)
            .field(
              'data',
              JSON.stringify({
                ...payload.options,
                [csType]: correctHash,
              }),
            )
            .expect('Content-Type', /application\/json/);

          // response should be 200
          expect(res.status).to.eql(200);
          const response = res.body as UpdateContentResponse;

          expect(response.metadata?.hashes).to.not.be.undefined();
          expect(response.metadata?.hashes![csType]).to.not.be.undefined();
          expect(response.metadata?.hashes![csType]).to.equal(
            testResource.metadata[csType],
          );

          // it should always compute sha1 hash
          expect(response.metadata?.hashes?.sha1).to.not.be.undefined();
          expect(response.metadata?.hashes?.sha1).to.equal(
            testResource.metadata.sha1,
          );
        },
      );
    }

    for (const csType of supportedHashesList) {
      it(
        tenantConfig.name +
          ' - should check the input ' +
          csType +
          ' checksum when passed and fail if not matching',
        async function () {
          const t = findTenant(tenantConfig);
          const target = rootNodes[key(t)].filter(
            o => o.type === StorageNodeType.FILE,
          )[4];

          const existing = await fetch(t, target.uuid);
          expect(existing?.originalName).to.not.be.undefined();

          const existingContent = await fetchContent(t, target.uuid);
          expect(existingContent.status).to.equal(200);
          expect(existingContent.body).to.not.be.undefined();

          const testResource = await getResourceWithMetadata('sample-png.png');
          expect(testResource.metadata[csType]).to.not.be.undefined();
          const wrongHash = testResource.metadata[csType] + '000';

          const payload = {
            field: 'file',
            content: testResource.content,
            options: {
              filename: 'sample-png.png',
              contentType: 'image/png',
            },
          };

          const res = await client
            .put(url(t, target.uuid))
            .set(principal.authHeaderName, principal.authHeaderValue)
            .attach(payload.field, payload.content, payload.options)
            .field(
              'data',
              JSON.stringify({
                ...payload.options,
                [csType]: wrongHash,
              }),
            )
            .expect('Content-Type', /application\/json/);

          // response should be 400
          expect(res.status).to.eql(400);

          const response = res.body as any;
          expect(response.error?.message).to.not.be.undefined();

          // error response details should contain the expected hash and the provided hash
          expect(response.error.message as string).to.match(
            new RegExp('.*' + testResource.metadata[csType] + '.*'),
          );
          expect(response.error.message as string).to.match(
            new RegExp('.*' + wrongHash + '.*'),
          );
          expect(response.error.message as string).to.match(
            new RegExp('.*' + csType + '.*'),
          );
        },
      );
    }

    it(
      tenantConfig.name +
        ' - should recompute a different ETag and return it on GET request',
      async function () {
        const t = findTenant(tenantConfig);
        const target = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[4];

        const existing = (await fetch(t, target.uuid))!;
        expect(existing.originalName).to.not.be.undefined();

        const existingContent = await fetchContent(t, target.uuid);
        expect(existingContent.status).to.equal(200);
        expect(existingContent.body).to.not.be.undefined();

        expect(existingContent.headers['etag']).to.not.be.undefined();

        if (tenantConfig.backboneType !== 'ONEDRIVE') {
          expect(existing.metadata?.contentETag).to.equal(
            existingContent.headers['etag'],
          );
        }

        const testResource = await getResource('sample-png-2.png');
        const payload = {
          field: 'file',
          content: testResource,
          options: {
            filename: 'sample-png.png',
            contentType: 'image/png',
          },
        };

        const createContentResponse = await client
          .put(url(t, target.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .field(
            'data',
            JSON.stringify({
              ...payload.options,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(200);

        const response = createContentResponse.body as UpdateContentResponse;
        expect(response.metadata?.contentETag).to.not.be.undefined();

        expect(createContentResponse.headers['etag']).to.not.be.equal(
          existing.metadata?.contentETag,
        );
        expect(response.metadata!.contentETag).to.not.be.equal(
          existing.metadata?.contentETag,
        );
        expect(createContentResponse.headers['etag']).to.not.be.equal(
          existingContent.headers['etag'],
        );
        expect(response.metadata!.contentETag).to.not.be.equal(
          existingContent.headers['etag'],
        );

        const fetchedContent1 = await fetchContent(t, target.uuid);
        const fetchedContent2 = await fetchContent(t, target.uuid);

        expect(fetchedContent1.status).to.equal(200);
        expect(fetchedContent1.body).to.not.be.undefined();
        expect(fetchedContent2.status).to.equal(200);
        expect(fetchedContent2.body).to.not.be.undefined();
        expect(fetchedContent1.headers['etag']).to.not.be.undefined();
        expect(fetchedContent2.headers['etag']).to.not.be.undefined();

        if (tenantConfig.backboneType !== 'ONEDRIVE') {
          expect(response.metadata?.contentETag).to.equal(
            fetchedContent1.headers['etag'],
          );
          expect(fetchedContent1.headers['etag']).to.equal(
            fetchedContent2.headers['etag'],
          );
        }

        expect(response.metadata?.contentETag).to.not.be.equal(
          existing.metadata?.contentETag,
        );
        expect(fetchedContent1.headers['etag']).to.not.be.equal(
          existing.metadata?.contentETag,
        );
        expect(fetchedContent2.headers['etag']).to.not.be.equal(
          existing.metadata?.contentETag,
        );
      },
    );

    it(
      tenantConfig.name +
        ' - should handle optionally incoming audit.version for optimistic check',
      async () => {
        const t = findTenant(tenantConfig);
        const subject = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[4];
        const existing = (await fetch(t, subject.uuid))!;

        const startingVer = existing.audit.version;
        expect(startingVer).to.be.greaterThan(
          0,
          'starting version should be greater than 0',
        );

        const testResource = await getResource('sample-png-2.png');
        const payload = {
          field: 'file',
          content: testResource,
          options: {
            filename: 'sample-png.png',
            contentType: 'image/png',
          },
        };

        const res1 = await client
          .put(url(t, subject.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .field(
            'data',
            JSON.stringify({
              ...payload.options,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(200);

        const response1 = res1.body as UpdateContentResponse;

        // check audit
        expect(response1.audit.version).to.equal(
          startingVer + 1,
          'updated version should be 2',
        );
        expect(
          new Date(response1.audit.modifiedAt!).getTime(),
        ).to.be.lessThanOrEqual(new Date().getTime());
        expect(response1.audit.modifiedBy).to.equal(principal.profile.code);

        // now call with audit in input
        const res2 = await client
          .put(url(t, subject.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .field(
            'data',
            JSON.stringify({
              ...payload.options,
              version: response1.audit.version,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(200);

        const response2 = res2.body as UpdateContentResponse;

        // check audit
        expect(response2.audit.version).to.equal(
          response1.audit.version + 1,
          'updated version should be 3',
        );
        expect(
          new Date(response2.audit.modifiedAt!).getTime(),
        ).to.be.greaterThan(new Date(response1.audit.modifiedAt!).getTime());
        expect(response2.audit.modifiedBy).to.equal(principal.profile.code);

        // now call with WRONG audit in input
        await client
          .put(url(t, subject.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .field(
            'data',
            JSON.stringify({
              ...payload.options,
              version: response2.audit.version - 1,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(409);

        await client
          .put(url(t, subject.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .field(
            'data',
            JSON.stringify({
              ...payload.options,
              version: response2.audit.version + 3,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(409);

        // now call with CORRECT audit in input
        const res3 = await client
          .put(url(t, subject.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .field(
            'data',
            JSON.stringify({
              ...payload.options,
              version: response2.audit.version,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(200);

        const response3 = res3.body as UpdateContentResponse;

        // check audit
        expect(response3.audit.version).to.equal(
          response2.audit.version + 1,
          'updated version should be 4',
        );
        expect(
          new Date(response3.audit.modifiedAt!).getTime(),
        ).to.be.greaterThan(new Date(response2.audit.modifiedAt!).getTime());
        expect(response3.audit.modifiedBy).to.equal(principal.profile.code);
      },
    );
  }
});
