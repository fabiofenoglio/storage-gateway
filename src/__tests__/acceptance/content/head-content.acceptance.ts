/* eslint-disable @typescript-eslint/no-invalid-this */
import {Client, expect, supertest} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {
  AbstractContent,
  ClientTenant,
  StorageNode,
  StorageNodeType,
} from '../../../models';
import {ObjectUtils} from '../../../utils';
import {
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

describe('Head on content', function () {
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

  const fetchContent = async (
    tenant: ClientTenant | string,
    uuid: string,
    reqBuilder?: (req: supertest.Test) => supertest.Test,
  ) => {
    let req = client
      .head(url(tenant, uuid))
      .redirects(2)
      .set(principal.authHeaderName, principal.authHeaderValue);
    if (reqBuilder) {
      req = reqBuilder(req);
    }

    const res = await req;

    if (res.status > 302) {
      console.log("fetchContent failed, here's response body:");
      console.log(res.body);
    }
    expect(res.status).to.equalOneOf([200, 206, 302]);
    return res;
  };

  before('setupApplication', async function () {
    this.timeout(60000);
    ({app, client} = await setupApplication());
    principal = givenPrincipal();
    mixedTenants = await givenMixedTenantConfigurations(app, principal.profile);

    for (const t of mixedTenants) {
      const k = key(t);

      // populate default tenant
      rootNodes[k] = await givenSomeNodes(app, t);
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
    await app.stop();
  });

  for (const tenantConfig of tenantConfigurationsUnderTest) {
    it(tenantConfig.name + ' - should return 200 OK', async () => {
      const metrics = await getMetricService(app);
      metrics.delta();

      const t = findTenant(tenantConfig);
      const res = await client
        .head(url(t, defaultNode[key(t)].uuid))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .redirects(2)
        .expect(200);

      const delta = metrics.delta();
      expect(delta.externalReadNumber).to.eql(0);
      expect(delta.externalReadWithDataNumber).to.eql(0);

      expect(res.headers['content-type']).to.startWith(
        defaultContent[key(t)].content.mimeType!,
      );
    });

    it(
      tenantConfig.name + ' - should return 401 without authorization',
      async () => {
        const t = findTenant(tenantConfig);
        await client
          .head(url(t, defaultNode[key(t)].uuid))
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
          .head(url(otherTenants[0], otherFile.uuid))
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
          .head(url('MISSINGTENANT', defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect('Content-Type', /application\/json/)
          .expect(404);
      },
    );

    it(tenantConfig.name + ' - should return 404 on missing uuid', async () => {
      const t = findTenant(tenantConfig);
      await client
        .head(url(t, 'missinguuid'))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(404);
    });

    it(
      tenantConfig.name +
        ' - HEAD on the content should not return the content',
      async () => {
        const t = findTenant(tenantConfig);
        const res = await client
          .head(url(t, defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .redirects(2)
          .expect(200);

        if (t.backboneType !== 'ONEDRIVE') {
          expect(res.headers['content-type']).to.startWith(
            defaultContent[key(t)].content.mimeType!,
          );
          expect(res.headers['content-length']).to.equal(
            defaultContent[key(t)].payload.length + '',
          );
        } else {
          expect(
            parseInt(res.headers['content-length'], 10),
          ).to.be.greaterThanOrEqual(defaultContent[key(t)].payload.length);
        }

        expect(res.body).to.be.empty();
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
            .head(url(code, defaultNode[key(t)].uuid))
            .set(principal.authHeaderName, principal.authHeaderValue)
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
            .head(url(t, code))
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect('Content-Type', /application\/json/)
            .expect(400);
        }
      },
    );

    it(
      tenantConfig.name + ' - HEAD on the content should return an ETag',
      async function () {
        const t = findTenant(tenantConfig);
        const res = await client
          .head(url(t, defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .redirects(2)
          .expect(200);

        const res2 = await client
          .head(url(t, defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .redirects(2)
          .expect(200);

        expect(res.headers['etag']).to.not.be.undefined();
        expect(res2.headers['etag']).to.not.be.undefined();
        expect(res.headers['etag']).to.equal(res2.headers['etag']);
      },
    );

    it(
      tenantConfig.name +
        ' - HEAD on the content should return 304 NOT CHANGED when If-None-Match matches',
      async function () {
        const metrics = await getMetricService(app);
        metrics.delta();

        const t = findTenant(tenantConfig);
        const res = await client
          .head(url(t, defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .redirects(2);

        expect(res.status).to.eql(200);
        expect(res.headers['etag']).to.not.be.undefined();

        let delta = metrics.delta();

        expect(delta.externalReadNumber).to.eql(0);
        expect(delta.externalReadWithDataNumber).to.eql(0);

        // make request with wrong 'If-None-Match' header
        const res2 = await fetchContent(t, defaultNode[key(t)].uuid, r =>
          r.set('If-None-Match', '"asdasdasd"'),
        );

        expect(res2.status).to.eql(200);
        expect(res2.headers['etag']).to.not.be.undefined();

        delta = metrics.delta();
        expect(delta.externalReadNumber).to.eql(0);
        expect(delta.externalReadWithDataNumber).to.eql(0);

        // make request with correct 'If-None-Match' header
        const res3 = await client
          .head(url(t, defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .set('If-None-Match', res.headers['etag'])
          .redirects(0);

        expect(res3.status).to.eql(304);
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
        ' - HEAD on the content should return Accept-Ranges header',
      async function () {
        const t = findTenant(tenantConfig);
        const res = await client
          .head(url(t, defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .redirects(2)
          .expect(200);

        expect(res.headers['accept-ranges']).to.not.be.undefined();
        expect(res.headers['accept-ranges']).to.equal('bytes');
      },
    );
  }
});
