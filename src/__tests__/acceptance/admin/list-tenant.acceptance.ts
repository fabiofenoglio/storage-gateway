import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant} from '../../../models';
import {givenInMemoryTenants} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {setupApplication} from '../../helper/test-helper';

describe('List tenants', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let inMemoryTenants: ClientTenant[];

  const call = () =>
    client
      .get('/admin/tenant')
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/);

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    principal = givenPrincipal(1, true);
    inMemoryTenants = await givenInMemoryTenants(app, principal.profile);
  });

  after(async () => {
    await app.stop();
  });

  it('should return 200 OK', async () => {
    await call().expect(200);
  });

  it('should have the single configured in-memory tenant', async () => {
    const res = await call().expect(200);

    expect(res.body.totalElements).to.equal(inMemoryTenants.length);

    expect(res.body.content).to.containEql({
      backboneType: inMemoryTenants[0].backboneType,
      code: inMemoryTenants[0].code,
      name: inMemoryTenants[0].name,
      backbone: {
        id: 1,
        name: 'In-Memory backbone #1',
      },
    });

    expect(res.body.content).to.containEql({
      backboneType: inMemoryTenants[1].backboneType,
      code: inMemoryTenants[1].code,
      name: inMemoryTenants[1].name,
      backbone: {
        id: 1,
        name: 'In-Memory backbone #1',
      },
    });

    expect(res.body.content).to.containEql({
      backboneType: inMemoryTenants[2].backboneType,
      code: inMemoryTenants[2].code,
      name: inMemoryTenants[2].name,
      backbone: {id: 1, name: 'In-Memory backbone #1'},
    });
  });
});
