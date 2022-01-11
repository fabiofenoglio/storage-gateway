import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant, StorageNode} from '../../../models';
import {GetNodeResponse} from '../../../rest';
import {givenInMemoryTenants, givenSomeNodes} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {setupApplication} from '../../helper/test-helper';

describe('Get node', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let inMemoryTenants: ClientTenant[];
  let defaultTenant: ClientTenant;
  let rootNodes: StorageNode[];

  const url = (tenant: ClientTenant | string, uuid: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    principal = givenPrincipal();
    inMemoryTenants = await givenInMemoryTenants(app, principal.profile);
    defaultTenant = inMemoryTenants[0];
    // populate default tenant
    rootNodes = await givenSomeNodes(app, defaultTenant);
    expect(rootNodes.length).to.be.greaterThan(0);
  });

  after(async () => {
    await app.stop();
  });

  it('should return 200 OK', async () => {
    await client
      .get(url(defaultTenant, rootNodes[0].uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);
  });

  it('should return 401 without authorization', async () => {
    await client
      .get(url(defaultTenant, rootNodes[0].uuid))
      .expect('Content-Type', /application\/json/)
      .expect(401);
  });

  it('should return 403 on not-owned tenants', async () => {
    const otherTenants = await givenInMemoryTenants(app, 'otherOwner');
    const otherNodes = await givenSomeNodes(app, otherTenants[0]);
    expect(rootNodes.length).to.be.greaterThan(0);

    await client
      .get(url(otherTenants[0], otherNodes[0].uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(403);
  });

  it('should return 404 on missing tenants', async () => {
    await client
      .get(url('MISSINGTENANT', rootNodes[0].uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return 404 on missing uuid', async () => {
    await client
      .get(url(defaultTenant, 'missinguuid'))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return all properties and hide privates', async () => {
    const payload = rootNodes[0];

    const res = await client
      .get(url(defaultTenant, payload.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response = res.body as GetNodeResponse;

    // should have uuid
    expect(response.name).to.equal(payload.name);
    expect(response.type).to.equal(payload.type);
    expect(response.uuid.length).to.be.greaterThan(5);

    // check metadata
    expect(response.metadata.length).to.equal(0);

    // check audit
    expect(response.audit.version).to.equal(1);
    expect(response.audit.createdBy).to.equal(principal.profile.code);
    expect(new Date(response.audit.createdAt).getTime()).to.be.lessThanOrEqual(
      new Date().getTime(),
    );
    expect(response.audit.modifiedAt).to.be.undefined();
    expect(response.audit.modifiedBy).to.be.undefined();
    expect(response.audit.version).to.equal(1);

    // should hide private properties
    expect(response).to.not.have.property('id');
    expect(response).to.not.have.property('version');

    // still no content
    expect(response.content).to.be.undefined();
  });

  it('should return 400 when called with bad uuid', async () => {
    const malformedCodes = [
      '..',
      '\\..\\',
      'UUID!',
      'uùid',
      ' ' + rootNodes[0].uuid,
    ];
    for (const code of malformedCodes) {
      await client
        .get(url(defaultTenant, code))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });
});
