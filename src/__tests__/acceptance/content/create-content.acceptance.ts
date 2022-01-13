/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-invalid-this */
import {
  Client,
  expect,
} from '@loopback/testlab';

import {StorageGatewayApplication} from '../../../application';
import {
  ClientTenant,
  ClientTenantBackbone,
  StorageNode,
  StorageNodeType,
} from '../../../models';
import {
  supportedHashesList,
} from '../../../models/content/content-upload-dto.model';
import {CreateContentResponse} from '../../../rest';
import {
  Constants,
  ObjectUtils,
} from '../../../utils';
import {
  getResource,
  getResourceWithMetadata,
  givenInMemoryTenants,
  givenMixedTenantConfigurations,
  givenSomeNodes,
} from '../../helper/data-helper';
import {
  givenPrincipal,
  TestPrincipal,
} from '../../helper/security-helper';
import {
  getMetricService,
  setupApplication,
  tenantConfigurationsUnderTest,
} from '../../helper/test-helper';

describe('Create content', function () {
  // NOSONAR
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let mixedTenants: ClientTenant[];
  let otherTenants: ClientTenant[];
  let otherNodes: StorageNode[];
  const rootNodes: {[key: string]: StorageNode[]} = {};
  const defaultNode: {[key: string]: StorageNode} = {};

  const key = (tenant: ClientTenant) => {
    return ObjectUtils.require(tenant, 'id');
  };

  const url = (tenant: ClientTenant | string, uuid: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid +
    '/content';

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

  const defaultFileContent = Buffer.from([1, 2, 3, 4]);
  const defaultPayload = {
    field: 'file',
    content: defaultFileContent,
    options: {
      filename: 'test.txt',
      contentType: 'application/octet-stream',
    },
  };

  const fetchContent = async (tenant: ClientTenant | string, uuid: string) => {
    const res = await client
      .get(url(tenant, uuid))
      .redirects(2)
      .set(principal.authHeaderName, principal.authHeaderValue);

    expect(res.status).to.equal(200);
    if (res.status === 302) {
      const otherUrl = res.headers['location'];
      return client
        .get(otherUrl)
        .set(
          'User-Agent',
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36',
        )
        .expect(200);
    }
    return res;
  };

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

  before('setupApplication', async () => {
    this.timeout(30000);
    ({app, client} = await setupApplication());
    principal = givenPrincipal();

    mixedTenants = await givenMixedTenantConfigurations(app, principal.profile);
    // populate default tenant

    for (const t of mixedTenants) {
      const k = key(t);
      rootNodes[k] = await givenSomeNodes(app, t, 16);
      defaultNode[k] = rootNodes[k].find(o => o.type === StorageNodeType.FILE)!;
      expect(defaultNode[k]).to.not.be.undefined();
    }

    otherTenants = await givenInMemoryTenants(app, 'otherOwner');
    otherNodes = await givenSomeNodes(app, otherTenants[0]);
    expect(otherNodes.length).to.be.greaterThan(0);
  });

  after(async function () {
    this.timeout(60000);
    for (const nodes of Object.values(rootNodes)) {
      const t = mixedTenants.find(c => c.id === nodes[0].tenantId)!;
      for (const node of nodes) {
        await deleteNodeContent(t, node.uuid, {failsafe: true});
      }
    }
    await app.stop();
  });

  const findTenant = (config: Partial<ClientTenant>) => {
    const tenant = mixedTenants.find(c => c.id === config.id);
    if (!tenant) {
      throw new Error('could not find test tenant of id ' + config.id);
    }
    return tenant;
  };

  for (const tenantConfig of tenantConfigurationsUnderTest) {
    it(
      tenantConfig.name +
        ' - should return 401 when called without authentication',
      async () => {
        const t = findTenant(tenantConfig);
        await client
          .post(url(t, defaultNode[key(t)].uuid))
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
      tenantConfig.name +
        ' - should return 403 when called on a not-owned tenant',
      async () => {
        const rootNode = otherNodes.find(o => o.type === StorageNodeType.FILE)!;

        const res = await client
          .post(url(otherTenants[0], rootNode.uuid))
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
          .expect('Content-Type', /application\/json/);

        expect(res.status).to.equal(403);
      },
    );

    it(
      tenantConfig.name +
        ' - should return 404 when called on a missing tenant',
      async () => {
        const t = findTenant(tenantConfig);
        await client
          .post(url('MISSINGTENANT', defaultNode[key(t)].uuid))
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

    it(tenantConfig.name + ' - should return 404 on missing node', async () => {
      const t = findTenant(tenantConfig);
      await client
        .post(url(t, 'MISSINGNODE'))
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
      tenantConfig.name + ' - should return 400 when called on FOLDER',
      async () => {
        const t = findTenant(tenantConfig);
        const target = rootNodes[key(t)].find(
          o => o.type === StorageNodeType.FOLDER,
        )!;
        expect(target).to.not.be.undefined();

        const res = await client
          .post(url(t, target.uuid))
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
          .expect('Content-Type', /application\/json/);
        expect(res.status).to.equal(400);
      },
    );

    it(
      tenantConfig.name +
        ' - should return 400 when called with bad tenant code',
      async () => {
        const t = findTenant(tenantConfig);
        const malformedCodes = ['\\..\\', 'TENANT!', 'tenànt', ' ' + t.code];
        for (const code of malformedCodes) {
          await client
            .post(url(code, defaultNode[key(t)].uuid))
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
      tenantConfig.name + ' - should return 400 when called with bad uuid',
      async () => {
        const t = findTenant(tenantConfig);
        const malformedCodes = [
          '..',
          '\\..\\',
          'UUID!',
          'uùid',
          ' ' + defaultNode.uuid,
        ];
        for (const code of malformedCodes) {
          await client
            .post(url(t, code))
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
      tenantConfig.name + ` - should return 400 with bad input data`,
      async () => {
        const t = findTenant(tenantConfig);
        const entries = [
          {
            options: {
              filename: null,
              contentType: defaultPayload.options.contentType,
            },
          },
          {
            options: {
              filename: ' ',
              contentType: defaultPayload.options.contentType,
            },
          },
        ];
        for (const propEntry of entries) {
          const newPayload: any = Object.assign({}, defaultPayload);
          Object.assign(newPayload, propEntry);

          const fail = await client
            .post(url(t, defaultNode[key(t)].uuid))
            .set(principal.authHeaderName, principal.authHeaderValue)
            .attach(newPayload.field, newPayload.content, newPayload.options)
            .field(
              'data',
              JSON.stringify({
                ...defaultPayload.options,
              }),
            )
            .expect('Content-Type', /application\/json/);

          expect(fail.status).to.equalOneOf(422, 400);
          expect(fail.body.error).to.not.be.undefined();
        }
      },
    );

    it(tenantConfig.name + ' - should return 200 OK', async function () {
      const t = findTenant(tenantConfig);
      const target = rootNodes[key(t)].filter(
        o => o.type === StorageNodeType.FILE,
      )[0];

      const res = await client
        .post(url(t, target.uuid))
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
        .expect('Content-Type', /application\/json/);

      expect(res.status).to.equal(201);

      await deleteNodeContent(t, target.uuid);
    });

    it(
      tenantConfig.name + ' - should return 409 when content already exists',
      async function () {
        const t = findTenant(tenantConfig);
        const target = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[1];

        await client
          .post(url(t, target.uuid))
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
          .expect(201);

        await client
          .post(url(t, target.uuid))
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
          .expect(409);

        await deleteNodeContent(t, target.uuid);
      },
    );

    it(
      tenantConfig.name + ' - should create a content record',
      async function () {
        const t = findTenant(tenantConfig);
        const target = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[2];
        const payload = {
          ...defaultPayload,
        };

        const res = await client
          .post(url(t, target.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .field(
            'data',
            JSON.stringify({
              ...payload.options,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(201);

        const response = res.body as CreateContentResponse;
        await deleteNodeContent(t, target.uuid);

        // should have uuid
        expect(response.key).to.equal(Constants.CONTENT.DEFAULT_KEY);
        expect(response.originalName).to.equal(payload.options.filename);
        expect(response.contentSize).to.equal(payload.content.length);
        expect(response).to.not.have.property('uuid');
        expect(response).to.have.property('encoding');
        expect(response).to.have.property('mimeType');
        expect(response.mimeType).to.equal(payload.options.contentType);

        // check audit
        expect(response.audit.version).to.equal(1);
        expect(response.audit.createdBy).to.equal(principal.profile.code);
        expect(
          new Date(response.audit.createdAt).getTime(),
        ).to.be.lessThanOrEqual(new Date().getTime());
        expect(response.audit.modifiedAt).to.be.undefined();
        expect(response.audit.modifiedBy).to.be.undefined();
        expect(response.audit.version).to.equal(1);

        // should hide private properties
        expect(response).to.not.have.property('id');
        expect(response).to.not.have.property('version');
      },
    );

    it(
      tenantConfig.name + ' - should create the physical content',
      async function () {
        const metrics = await getMetricService(app);
        metrics.delta();

        const t = findTenant(tenantConfig);
        const target = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[3];
        const payload = {
          ...defaultPayload,
        };

        await client
          .post(url(t, target.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .field(
            'data',
            JSON.stringify({
              ...payload.options,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(201);

        // check backbone calls metrics
        const delta = metrics.delta();
        if (t.backboneType !== ClientTenantBackbone.MEMORY) {
          expect(delta.externalWriteWithDataNumber).to.eql(1);
        }

        const createdContent = await fetchContent(t, target.uuid);
        await deleteNodeContent(t, target.uuid);

        expect(createdContent.status).to.equal(200);
        expect(createdContent.body).to.not.be.undefined();

        if (t.backboneType !== ClientTenantBackbone.ONEDRIVE) {
          expect(createdContent.headers['content-type']).to.startWith(
            payload.options.contentType,
          );

          expect(createdContent.headers['content-length']).to.equal(
            payload.content.length + '',
          );

          expect(payload.content.compare(createdContent.body)).to.equal(0);
          expect(createdContent.body.compare(payload.content)).to.equal(0);
          expect(createdContent.body.compare(createdContent.body)).to.equal(0);
        } else {
          // https://stackoverflow.com/questions/26906007/onedrive-wrong-size-for-png-files
          expect(
            parseInt(createdContent.headers['content-length'], 10),
          ).to.be.greaterThanOrEqual(payload.content.length);
        }
      },
    );

    it(
      tenantConfig.name +
        ' - should process a sample PNG file and create thumbnails according to tenant configuration',
      async function () {
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
        )[4];
        const payload = {
          field: 'file',
          content: await getResource('sample-png.png'),
          options: {
            filename: 'sample-png.png',
            contentType: 'image/png',
          },
        };

        const createContentResponse = await client
          .post(url(t, target.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .field(
            'data',
            JSON.stringify({
              ...payload.options,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(201);

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

        const response = createContentResponse.body as CreateContentResponse;

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
      tenantConfig.name +
        ' - should compute the default sha1 checksum when none passed',
      async function () {
        const t = findTenant(tenantConfig);
        const target = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[5];

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
          .post(url(t, target.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .field(
            'data',
            JSON.stringify({
              ...payload.options,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(201);

        const createdContent = await fetchContent(t, target.uuid);
        await deleteNodeContent(t, target.uuid);

        const response = createContentResponse.body as CreateContentResponse;

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
          )[5];

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
            .post(url(t, target.uuid))
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

          // response should be 201
          expect(res.status).to.eql(201);
          const response = res.body as CreateContentResponse;

          await deleteNodeContent(t, target.uuid);

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
          )[5];

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
            .post(url(t, target.uuid))
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

          const response = res.body;
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
        ' - should compute the ETag and return it on GET request',
      async function () {
        const t = findTenant(tenantConfig);
        const target = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[5];

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
          .post(url(t, target.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .field(
            'data',
            JSON.stringify({
              ...payload.options,
            }),
          )
          .expect('Content-Type', /application\/json/)
          .expect(201);

        const response = createContentResponse.body as CreateContentResponse;
        expect(response.metadata?.contentETag).to.not.be.undefined();

        const fetchedContent1 = await fetchContent(t, target.uuid);
        const fetchedContent2 = await fetchContent(t, target.uuid);
        await deleteNodeContent(t, target.uuid);

        if (tenantConfig.backboneType !== 'ONEDRIVE') {
          expect(response.metadata?.contentETag).to.equal(
            fetchedContent1.headers['etag'],
          );
          expect(fetchedContent1.headers['etag']).to.equal(
            fetchedContent2.headers['etag'],
          );
        }

        expect(fetchedContent1.status).to.equal(200);
        expect(fetchedContent1.body).to.not.be.undefined();
        expect(fetchedContent2.status).to.equal(200);
        expect(fetchedContent2.body).to.not.be.undefined();
        expect(fetchedContent1.headers['etag']).to.not.be.undefined();
        expect(fetchedContent2.headers['etag']).to.not.be.undefined();
      },
    );
  }
});
