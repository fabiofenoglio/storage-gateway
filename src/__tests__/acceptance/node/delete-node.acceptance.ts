/* eslint-disable @typescript-eslint/no-explicit-any */
import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant, StorageNode} from '../../../models';
import {ObjectUtils} from '../../../utils';
import {
  givenInMemoryTenants,
  givenMixedTenantConfigurations,
  givenSomeContent,
  givenSomeNodes,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {
  setupApplication,
  tenantConfigurationsUnderTest,
} from '../../helper/test-helper';

describe('Delete node', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let mixedTenants: ClientTenant[];
  const rootNodes: {[key: string]: StorageNode[]} = {};

  const url = (tenant: ClientTenant | string, uuid: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid;

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

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    principal = givenPrincipal();

    mixedTenants = await givenMixedTenantConfigurations(app, principal.profile);
    // populate default tenant

    for (const t of mixedTenants) {
      const k = key(t);
      rootNodes[k] = await givenSomeNodes(app, t, 16);
    }
  });

  after(async () => {
    await app.stop();
  });

  for (const tenantConfig of tenantConfigurationsUnderTest) {
    it(
      tenantConfig.name + ' - should return 401 without authorization',
      async () => {
        const defaultTenant = findTenant(tenantConfig);
        await client
          .delete(url(defaultTenant, rootNodes[key(defaultTenant)][0].uuid))
          .expect('Content-Type', /application\/json/)
          .expect(401);
      },
    );

    it(
      tenantConfig.name + ' - should return 403 on not-owned tenants',
      async () => {
        const otherTenants = await givenInMemoryTenants(app, 'otherOwner');
        const otherNodes = await givenSomeNodes(app, otherTenants[0]);

        await client
          .delete(url(otherTenants[0], otherNodes[0].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect('Content-Type', /application\/json/)
          .expect(403);
      },
    );

    it(
      tenantConfig.name + ' - should return 404 on missing tenants',
      async () => {
        const defaultTenant = findTenant(tenantConfig);
        await client
          .delete(url('MISSINGTENANT', rootNodes[key(defaultTenant)][0].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect('Content-Type', /application\/json/)
          .expect(404);
      },
    );

    it(tenantConfig.name + ' - should return 404 on missing uuid', async () => {
      const defaultTenant = findTenant(tenantConfig);
      await client
        .delete(url(defaultTenant, 'missinguuid'))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(404);
    });

    it(
      tenantConfig.name + ' - should return 400 when called with bad uuid',
      async () => {
        const defaultTenant = findTenant(tenantConfig);
        const malformedCodes = [
          '..',
          '\\..\\',
          'UUID!',
          'uùid',
          ' ' + rootNodes[key(defaultTenant)][0].uuid,
        ];
        for (const code of malformedCodes) {
          await client
            .delete(url(defaultTenant, code))
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect('Content-Type', /application\/json/)
            .expect(400);
        }
      },
    );

    it(tenantConfig.name + ' - should return 200 OK', async () => {
      const defaultTenant = findTenant(tenantConfig);
      await client
        .delete(url(defaultTenant, rootNodes[key(defaultTenant)][0].uuid))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect(204);
    });

    it(
      tenantConfig.name +
        ' - should not allow to retrieve deleted elements with get by uuid',
      async () => {
        const defaultTenant = findTenant(tenantConfig);
        await client
          .get(url(defaultTenant, rootNodes[key(defaultTenant)][1].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect(200);

        await client
          .delete(url(defaultTenant, rootNodes[key(defaultTenant)][1].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect(204);

        await client
          .get(url(defaultTenant, rootNodes[key(defaultTenant)][1].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect(404);
      },
    );

    it(
      tenantConfig.name +
        ' - should not allow to retrieve deleted elements with listing',
      async () => {
        const defaultTenant = findTenant(tenantConfig);
        const res1 = await client
          .get('/tenant/' + defaultTenant.code + '/items')
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect(200);

        expect(
          res1.body.content.find(
            (o: any) => o.uuid === rootNodes[key(defaultTenant)][2].uuid,
          ),
        ).to.not.be.undefined();

        await client
          .delete(url(defaultTenant, rootNodes[key(defaultTenant)][2].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect(204);

        const res2 = await client
          .get('/tenant/' + defaultTenant.code + '/items')
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect(200);

        expect(
          res2.body.content.find(
            (o: any) => o.uuid === rootNodes[key(defaultTenant)][2].uuid,
          ),
        ).to.be.undefined();
      },
    );

    it(tenantConfig.name + ' - should not allow to delete again', async () => {
      const defaultTenant = findTenant(tenantConfig);
      await client
        .delete(url(defaultTenant, rootNodes[key(defaultTenant)][3].uuid))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect(204);

      await client
        .delete(url(defaultTenant, rootNodes[key(defaultTenant)][3].uuid))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect(404);
    });

    it(tenantConfig.name + ' - should delete a node with content', async () => {
      const defaultTenant = findTenant(tenantConfig);
      const node = rootNodes[key(defaultTenant)].filter(
        n => n.type === 'FILE',
      )[4];
      await givenSomeContent(app, defaultTenant, node);

      await client
        .delete(url(defaultTenant, node.uuid))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect(204);
    });
  }
});
