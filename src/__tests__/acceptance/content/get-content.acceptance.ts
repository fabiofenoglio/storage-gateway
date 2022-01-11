/* eslint-disable @typescript-eslint/no-invalid-this */
import {Client, expect, supertest} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {
  AbstractContent,
  ClientTenant,
  StorageNode,
  StorageNodeType,
} from '../../../models';
import {GetNodeResponse} from '../../../rest';
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

describe('Get content', function () {
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

  const fetchContent = async (
    tenant: ClientTenant | string,
    uuid: string,
    reqBuilder?: (req: supertest.Test) => supertest.Test,
  ) => {
    let req = client
      .get(url(tenant, uuid))
      .redirects(2)
      .set(principal.authHeaderName, principal.authHeaderValue);
    if (reqBuilder) {
      req = reqBuilder(req);
    }

    let res = await req;

    if (res.status > 302) {
      console.log("fetchContent failed, here's response body:");
      console.log(res.body);
    }
    expect(res.status).to.equalOneOf([200, 206, 302]);

    if (res.status === 302) {
      const otherUrl = res.headers['location'];
      console.log('following redirect to ' + otherUrl);
      req = client
        .get(otherUrl)
        .set('Accept', '*/*')
        .set('Connection', 'close')
        .set(
          'User-Agent',
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36',
        );
      if (reqBuilder) {
        req = reqBuilder(req);
      }
      res = await req;
      expect(res.status).to.equalOneOf([200, 206, 302]);
      return res;
    }
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
        .get(url(t, defaultNode[key(t)].uuid))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .redirects(2)
        .expect(200);

      const delta = metrics.delta();
      if (t.backboneType === 'ONEDRIVE' && !t.encryptionAlgorithm) {
        // native redirect
        expect(delta.externalReadWithDataNumber).to.eql(0);
        expect(delta.externalReadNumber).to.be.greaterThan(0);
      } else {
        expect(delta.externalReadWithDataNumber).to.eql(1);
      }

      expect(res.headers['content-type']).to.startWith(
        defaultContent[key(t)].content.mimeType!,
      );
    });

    it(
      tenantConfig.name + ' - should return 401 without authorization',
      async () => {
        const t = findTenant(tenantConfig);
        await client
          .get(url(t, defaultNode[key(t)].uuid))
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
          .get(url(otherTenants[0], otherFile.uuid))
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
          .get(url('MISSINGTENANT', defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect('Content-Type', /application\/json/)
          .expect(404);
      },
    );

    it(tenantConfig.name + ' - should return 404 on missing uuid', async () => {
      const t = findTenant(tenantConfig);
      await client
        .get(url(t, 'missinguuid'))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(404);
    });

    it(
      tenantConfig.name +
        ' - GET on the main node should return all content properties and hide privates',
      async () => {
        const t = findTenant(tenantConfig);
        const res = await client
          .get(nodeUrl(t, defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect('Content-Type', /application\/json/)
          .expect(200);

        const contentResponse = (res.body as GetNodeResponse).content!;

        // should have uuid
        expect(contentResponse).to.not.have.property('uuid');
        expect(contentResponse.originalName).to.equal(
          defaultContent[key(t)].content.originalName,
        );
        expect(contentResponse.mimeType).to.equal(
          defaultContent[key(t)].content.mimeType,
        );
        expect(contentResponse.encoding).to.equal(
          defaultContent[key(t)].content.encoding,
        );

        // check audit
        expect(contentResponse.audit.version).to.equal(1);
        expect(contentResponse.audit.createdBy).to.not.be.undefined();
        expect(
          new Date(contentResponse.audit.createdAt).getTime(),
        ).to.be.lessThanOrEqual(new Date().getTime());
        expect(contentResponse.audit.modifiedAt).to.be.undefined();
        expect(contentResponse.audit.modifiedBy).to.be.undefined();
        expect(contentResponse.audit.version).to.equal(1);

        // should hide private properties
        expect(contentResponse).to.not.have.property('id');
        expect(contentResponse).to.not.have.property('version');
      },
    );

    it(
      tenantConfig.name + ' - GET on the content should return binary content',
      async () => {
        const t = findTenant(tenantConfig);
        const res = await client
          .get(url(t, defaultNode[key(t)].uuid))
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

        expect(res.body.compare(defaultContent[key(t)].payload)).to.equal(0);
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
            .get(url(code, defaultNode[key(t)].uuid))
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
            .get(url(t, code))
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect('Content-Type', /application\/json/)
            .expect(400);
        }
      },
    );

    it(
      tenantConfig.name + ' - GET on the content should return an ETag',
      async function () {
        const t = findTenant(tenantConfig);

        const res1 = await client
          .get(url(t, defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .redirects(2)
          .expect(200);

        const head1 = await client
          .head(url(t, defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .redirects(2)
          .expect(200);

        const head2 = await client
          .head(url(t, defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .redirects(2)
          .expect(200);

        const res2 = await client
          .get(url(t, defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .redirects(2)
          .expect(200);

        expect(res1.headers['etag']).to.not.be.undefined();
        expect(res2.headers['etag']).to.not.be.undefined();
        expect(head1.headers['etag']).to.not.be.undefined();
        expect(head2.headers['etag']).to.not.be.undefined();
        expect(res1.headers['etag']).to.equal(res2.headers['etag']);
        expect(res1.headers['etag']).to.equal(head1.headers['etag']);
        expect(res1.headers['etag']).to.equal(head2.headers['etag']);
      },
    );

    it(
      tenantConfig.name +
        ' - GET on the content should return 304 NOT CHANGED when If-None-Match matches',
      async function () {
        const metrics = await getMetricService(app);
        metrics.delta();

        const t = findTenant(tenantConfig);

        const head1 = await client
          .head(url(t, defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .redirects(2)
          .expect(200);

        await client
          .get(url(t, defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .set('If-None-Match', head1.headers['etag'])
          .redirects(0)
          .expect(304);

        await client
          .head(url(t, defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .set('If-None-Match', head1.headers['etag'])
          .redirects(0)
          .expect(304);

        const res = await client
          .get(url(t, defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .redirects(2);

        expect(res.status).to.eql(200);
        expect(res.headers['etag']).to.not.be.undefined();

        expect(head1.headers['etag']).to.eql(res.headers['etag']);

        let delta = metrics.delta();
        if (!(t.backboneType === 'ONEDRIVE' && !t.encryptionAlgorithm)) {
          expect(delta.externalReadWithDataNumber).to.eql(1);
        } else {
          expect(delta.externalReadWithDataNumber).to.eql(0);
        }

        // make request with wrong 'If-None-Match' header
        const res2 = await fetchContent(t, defaultNode[key(t)].uuid, r =>
          r.set('If-None-Match', '"asdasdasd"'),
        );

        expect(res2.status).to.eql(200);
        expect(res2.headers['etag']).to.not.be.undefined();

        delta = metrics.delta();
        if (!(t.backboneType === 'ONEDRIVE' && !t.encryptionAlgorithm)) {
          expect(delta.externalReadWithDataNumber).to.eql(1);
        } else {
          expect(delta.externalReadWithDataNumber).to.eql(0);
        }

        // make request with correct 'If-None-Match' header
        const res3 = await client
          .get(url(t, defaultNode[key(t)].uuid))
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
        ' - GET on the content should return Accept-Ranges header',
      async function () {
        const t = findTenant(tenantConfig);
        const res = await client
          .get(url(t, defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .redirects(2)
          .expect(200);

        expect(res.headers['accept-ranges']).to.not.be.undefined();
        expect(res.headers['accept-ranges']).to.equal('bytes');
      },
    );

    it(
      tenantConfig.name + ' - GET on the content should accept ranged requests',
      async function () {
        const t = findTenant(tenantConfig);
        const expectedFullContent = defaultContent[key(t)];

        const reqBuilder = () =>
          client
            .get(url(t, defaultNode[key(t)].uuid))
            .redirects(2)
            .set(principal.authHeaderName, principal.authHeaderValue);

        let res = await fetchContent(t, defaultNode[key(t)].uuid, r =>
          r.set('Range', 'bytes=0-299'),
        );
        expect(res.status).to.eql(206);

        // should expose accept-ranges header with a value of 'bytes'
        expect(res.headers['accept-ranges']).to.not.be.undefined();
        expect(res.headers['accept-ranges']).to.equal('bytes');

        // should return the required range
        if (t.backboneType === 'ONEDRIVE') {
          expect(
            parseInt(res.headers['content-length'], 10),
          ).to.be.greaterThanOrEqual(300);
        } else {
          expect(res.headers['content-length']).to.equal('300');
        }

        expect(
          res.body.compare(expectedFullContent.payload.slice(0, 300)),
        ).to.equal(0);

        // should correctly handle edge cases
        res = await fetchContent(t, defaultNode[key(t)].uuid, r =>
          r.set(
            'Range',
            'bytes=' +
              (expectedFullContent.payload.length - 100) +
              '-' +
              (expectedFullContent.payload.length - 1),
          ),
        );

        expect(res.status).to.eql(206);
        if (t.backboneType === 'ONEDRIVE') {
          expect(
            parseInt(res.headers['content-length'], 10),
          ).to.be.greaterThanOrEqual(100);
        } else {
          expect(res.headers['content-length']).to.equal('100');
        }

        expect(
          res.body.compare(
            expectedFullContent.payload.slice(
              expectedFullContent.payload.length - 100,
              expectedFullContent.payload.length,
            ),
          ),
        ).to.equal(0);

        res = await reqBuilder().set('Range', 'bytes=-49');
        if (t.backboneType !== 'ONEDRIVE') {
          expect(res.status).to.eql(206);
          expect(res.headers['content-length']).to.equal('50');
          expect(
            res.body.compare(expectedFullContent.payload.slice(0, 50)),
          ).to.equal(0);
        }

        res = await fetchContent(t, defaultNode[key(t)].uuid, r =>
          r.set(
            'Range',
            'bytes=' + (expectedFullContent.payload.length - 100) + '-',
          ),
        );
        expect(res.status).to.eql(206);
        if (t.backboneType === 'ONEDRIVE') {
          expect(
            parseInt(res.headers['content-length'], 10),
          ).to.be.greaterThanOrEqual(100);
        } else {
          expect(res.headers['content-length']).to.equal('100');
        }
        expect(
          res.body.compare(
            expectedFullContent.payload.slice(
              expectedFullContent.payload.length - 100,
              expectedFullContent.payload.length,
            ),
          ),
        ).to.equal(0);

        // should return 416 when requested range is invalid or badly formatted
        res = await reqBuilder().set(
          'Range',
          'bytes=' +
            (expectedFullContent.payload.length - 100) +
            '-' +
            expectedFullContent.payload.length,
        );

        expect(res.status).to.eql(416);

        res = await reqBuilder().set('Range', 'bytes=-5-15');
        expect(res.status).to.eql(416);

        res = await reqBuilder().set('Range', 'potatoes=1-15');
        expect(res.status).to.eql(416);
      },
    );
  }
});
