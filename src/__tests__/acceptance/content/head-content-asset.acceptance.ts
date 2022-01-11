/* eslint-disable @typescript-eslint/no-invalid-this */
import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {
  AbstractContent,
  ClientTenant,
  StorageNode,
  StorageNodeType,
} from '../../../models';
import {ContentMetadataImageThumbnail} from '../../../models/content/content-metadata-image-thumbnail.model';
import {GetNodeResponse} from '../../../rest';
import {ContentService} from '../../../services';
import {ObjectUtils} from '../../../utils';
import {
  getResource,
  givenInMemoryTenants,
  givenMixedTenantConfigurations,
  givenSomeContent,
  givenSomeNodes,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {
  getMetricService,
  setupApplication,
  sleep,
  tenantConfigurationsUnderTest,
} from '../../helper/test-helper';

describe('Head on content asset', function () {
  // NOSONAR
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let mixedTenants: ClientTenant[];
  const defaultContent: {
    [key: string]: {content: AbstractContent; payload: Buffer};
  } = {};
  const rootNodes: {[key: string]: StorageNode[]} = {};
  const defaultNode: {[key: string]: StorageNode} = {};
  const defaultAsset: {[key: string]: ContentMetadataImageThumbnail} = {};

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

  const assetUrl = (
    tenant: ClientTenant | string,
    uuid: string,
    akey: string,
  ) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid +
    '/assets/' +
    akey;

  const nodeUrl = (tenant: ClientTenant | string, uuid: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid;

  const fetchAssetContent = (
    tenant: ClientTenant | string,
    uuid: string,
    akey: string,
  ) =>
    client
      .head(assetUrl(tenant, uuid, akey))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .redirects(2);

  const fetchNode = (tenant: ClientTenant | string, uuid: string) =>
    client
      .get(nodeUrl(tenant, uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .redirects(0);

  const ensureContentMetadataReady = async (
    tenant: ClientTenant,
    nodeEntity: StorageNode,
  ) => {
    let waited = 0;
    let node = await fetchNode(tenant, nodeEntity.uuid).expect(200);
    while (!(node.body as GetNodeResponse).content?.metadata?.ready) {
      console.log(
        'waiting for metadata to be ready for node ' + nodeEntity.uuid + ' ...',
      );
      await sleep(500);
      waited += 500;
      if (waited >= 60000) {
        throw new Error('Timeout waiting for metadata to be ready');
      }
      node = await fetchNode(tenant, nodeEntity.uuid).expect(200);
    }
    const contentService: ContentService = await app.get(
      'services.ContentService',
    );

    return contentService.getContent(tenant, nodeEntity);
  };

  before('setupApplication', async function () {
    this.timeout(60000);
    ({app, client} = await setupApplication());
    principal = givenPrincipal();
    mixedTenants = await givenMixedTenantConfigurations(app, principal.profile);

    const res = await getResource('sample-png.png');

    for (const t of mixedTenants) {
      const k = key(t);
      if (!t.enableThumbnails) {
        continue;
      }

      // populate default tenant
      rootNodes[k] = await givenSomeNodes(app, t);
      expect(rootNodes[k].length).to.be.greaterThan(0);

      defaultNode[k] = rootNodes[k].find(o => o.type === StorageNodeType.FILE)!;
      expect(defaultNode).to.not.be.undefined();

      defaultContent[k] = await givenSomeContent(app, t, defaultNode[k], {
        buffer: res,
        fileName: 'test.png',
        mimeType: 'image/png',
      });
    }

    for (const t of mixedTenants) {
      const k = key(t);
      if (!t.enableThumbnails) {
        continue;
      }

      const processedContent = await ensureContentMetadataReady(
        t,
        defaultNode[k],
      );
      defaultContent[k].content = processedContent!.entity;

      defaultAsset[k] = (defaultContent[k].content.metadata!.image!
        .thumbnails ?? [])[0];

      if (!defaultAsset[k]) {
        throw new Error('No asset for item key ' + k);
      }
    }
  });

  after(async () => {
    await app.stop();
  });

  for (const tenantConfig of tenantConfigurationsUnderTest) {
    // skip for onedrive
    if (!tenantConfig.enableThumbnails) {
      continue;
    }

    it(
      tenantConfig.name + ' - should return 401 without authorization',
      async () => {
        const t = findTenant(tenantConfig);
        await client
          .head(
            assetUrl(
              t,
              defaultNode[key(t)].uuid,
              defaultAsset[key(t)].assetKey,
            ),
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
        const otherContent = await givenSomeContent(
          app,
          otherTenants[0],
          otherFile,
          {
            buffer: await getResource('sample-png.png'),
            fileName: 'test.png',
            mimeType: 'image/png',
          },
        );

        await client
          .head(
            assetUrl(
              otherTenants[0],
              otherFile.uuid,
              otherContent.content.metadata!.image!.thumbnails![0].assetKey,
            ),
          )
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect('Content-Type', /application\/json/)
          .expect(403);
      },
    );

    it(
      tenantConfig.name + ' - should return 404 on missing tenants',
      async () => {
        const t = findTenant(tenantConfig);
        await client
          .head(
            assetUrl(
              'MISSINGTENANT',
              defaultNode[key(t)].uuid,
              defaultAsset[key(t)].assetKey,
            ),
          )
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect('Content-Type', /application\/json/)
          .expect(404);
      },
    );

    it(tenantConfig.name + ' - should return 404 on missing uuid', async () => {
      const t = findTenant(tenantConfig);
      await client
        .head(assetUrl(t, 'missinguuid', defaultAsset[key(t)].assetKey))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(404);
    });

    it(
      tenantConfig.name +
        ' - should return 400 when called with bad tenant code',
      async () => {
        const t = findTenant(tenantConfig);
        const malformedCodes = ['\\..\\', 'TENANT!', 'tenànt', ' ' + t.code];
        for (const code of malformedCodes) {
          await fetchAssetContent(
            code,
            defaultNode[key(t)].uuid,
            defaultAsset[key(t)].assetKey,
          )
            .expect('Content-Type', /application\/json/)
            .expect(400);
        }
      },
    );

    it(
      tenantConfig.name + ' - should return 400 when called with bad asset key',
      async () => {
        const t = findTenant(tenantConfig);
        const malformedCodes = [
          'ASSET!',
          'àasset',
          ' ' + defaultAsset.assetKey,
        ];
        for (const code of malformedCodes) {
          await fetchAssetContent(t, defaultNode[key(t)].uuid, code)
            .expect('Content-Type', /application\/json/)
            .expect(400);
        }
      },
    );

    it(
      tenantConfig.name +
        ' - should return 404 when called with missing asset key',
      async () => {
        const t = findTenant(tenantConfig);
        await fetchAssetContent(t, defaultNode[key(t)].uuid, 'missing.asset')
          .expect('Content-Type', /application\/json/)
          .expect(404);
      },
    );

    it(tenantConfig.name + ' - should return 200 OK', async () => {
      const t = findTenant(tenantConfig);

      const metrics = await getMetricService(app);
      metrics.delta();

      const res = await fetchAssetContent(
        t,
        defaultNode[key(t)].uuid,
        defaultAsset[key(t)].assetKey,
      )
        .set('X-Request-Id', '219ju0t904qae045y2uj24')
        .expect(200);

      const delta = metrics.delta();
      expect(delta.externalReadWithDataNumber).to.eql(0);
      expect(delta.externalReadNumber).to.eql(0);

      expect(res.headers['content-type']).to.startWith('image/');
      expect(res.headers['content-length']).to.not.be.undefined();
    });

    it(
      tenantConfig.name + ' - HEAD on the asset content should return an ETag',
      async () => {
        const t = findTenant(tenantConfig);
        const res = await fetchAssetContent(
          t,
          defaultNode[key(t)].uuid,
          defaultAsset[key(t)].assetKey,
        ).expect(200);

        const res2 = await fetchAssetContent(
          t,
          defaultNode[key(t)].uuid,
          defaultAsset[key(t)].assetKey,
        ).expect(200);

        expect(res.headers['etag']).to.not.be.undefined();
        expect(res2.headers['etag']).to.not.be.undefined();
        expect(res.headers['etag']).to.equal(res2.headers['etag']);
      },
    );

    it(
      tenantConfig.name +
        ' - HEAD on the asset content should return 304 NOT CHANGED when If-None-Match matches',
      async () => {
        const metrics = await getMetricService(app);
        metrics.delta();

        const t = findTenant(tenantConfig);
        const res = await fetchAssetContent(
          t,
          defaultNode[key(t)].uuid,
          defaultAsset[key(t)].assetKey,
        ).expect(200);

        let delta = metrics.delta();
        expect(delta.externalReadWithDataNumber).to.eql(0);
        expect(delta.externalReadNumber).to.eql(0);

        expect(res.headers['etag']).to.not.be.undefined();

        // make request with wrong 'If-None-Match' header
        await fetchAssetContent(
          t,
          defaultNode[key(t)].uuid,
          defaultAsset[key(t)].assetKey,
        )
          .set('If-None-Match', 'W/"asdasdasdasd"')
          .expect(200);

        delta = metrics.delta();
        expect(delta.externalReadWithDataNumber).to.eql(0);
        expect(delta.externalReadNumber).to.eql(0);

        // make request with correct 'If-None-Match' header
        const res3 = await fetchAssetContent(
          t,
          defaultNode[key(t)].uuid,
          defaultAsset[key(t)].assetKey,
        )
          .set('If-None-Match', res.headers['etag'])
          .redirects(0)
          .expect(304);

        expect(res3.headers['content-length']).to.be.undefined();
        expect(res3.headers['etag']).to.not.be.undefined();
        expect(res3.body).to.be.empty();

        // it should not make any call to backbone storage
        delta = metrics.delta();
        expect(delta.externalReadWithDataNumber).to.eql(0);
        expect(delta.externalReadNumber).to.eql(0);
      },
    );

    it(
      tenantConfig.name +
        ' - HEAD on the asset content should return Accept-Ranges header',
      async () => {
        const t = findTenant(tenantConfig);
        const res = await fetchAssetContent(
          t,
          defaultNode[key(t)].uuid,
          defaultAsset[key(t)].assetKey,
        ).expect(200);

        expect(res.headers['accept-ranges']).to.not.be.undefined();
        expect(res.headers['accept-ranges']).to.equal('bytes');
      },
    );
  }
});
