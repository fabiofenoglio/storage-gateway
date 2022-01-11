import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant, StorageNode, StorageNodeMetadata} from '../../../models';
import {GetMetadataResponse} from '../../../rest';
import {
  givenInMemoryTenants,
  givenSomeMetadata,
  givenSomeNodes,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {setupApplication} from '../../helper/test-helper';

describe('Get node metadata', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let inMemoryTenants: ClientTenant[];
  let defaultTenant: ClientTenant;
  let rootNodes: StorageNode[];
  let defaultNode: StorageNode;
  let givenMeta: StorageNodeMetadata[];
  let defaultMeta: StorageNodeMetadata;

  const url = (tenant: ClientTenant | string, uuid: string, key: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid +
    '/metadata/' +
    key;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    principal = givenPrincipal();
    inMemoryTenants = await givenInMemoryTenants(app, principal.profile);
    defaultTenant = inMemoryTenants[0];
    // populate default tenant
    rootNodes = await givenSomeNodes(app, defaultTenant);
    expect(rootNodes.length).to.be.greaterThan(0);
    defaultNode = rootNodes[0];

    givenMeta = await givenSomeMetadata(app, defaultTenant, defaultNode);
    expect(givenMeta.length).to.be.greaterThan(0);
    defaultMeta = givenMeta[0];
  });

  after(async () => {
    await app.stop();
  });

  it('should return 200 OK', async () => {
    await client
      .get(url(defaultTenant, defaultNode.uuid, defaultMeta.key))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);
  });

  it('should return 401 without authorization', async () => {
    await client
      .get(url(defaultTenant, defaultNode.uuid, defaultMeta.key))
      .expect('Content-Type', /application\/json/)
      .expect(401);
  });

  it('should return 403 on not-owned tenants', async () => {
    const otherTenants = await givenInMemoryTenants(app, 'otherOwner');
    const otherNodes = await givenSomeNodes(app, otherTenants[0]);
    expect(rootNodes.length).to.be.greaterThan(0);
    const otherMeta = await givenSomeMetadata(
      app,
      otherTenants[0],
      otherNodes[0],
    );
    expect(otherMeta.length).to.be.greaterThan(0);

    await client
      .get(url(otherTenants[0], otherNodes[0].uuid, otherMeta[0].key))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(403);
  });

  it('should return 404 on missing tenants', async () => {
    await client
      .get(url('MISSINGTENANT', defaultNode.uuid, defaultMeta.key))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return 404 on missing uuid', async () => {
    await client
      .get(url(defaultTenant, 'missinguuid', defaultMeta.key))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return 404 on missing key', async () => {
    await client
      .get(url(defaultTenant, defaultNode.uuid, 'missingKey'))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return all properties and hide privates', async () => {
    const res = await client
      .get(url(defaultTenant, defaultNode.uuid, defaultMeta.key))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response = res.body as GetMetadataResponse;

    // should have uuid
    expect(response.key).to.equal(defaultMeta.key);
    expect(response.value).to.deepEqual(defaultMeta.value);

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
  });

  it('should return 400 when called with bad tenant code', async () => {
    const malformedCodes = [
      '\\..\\',
      'TENANT!',
      'tenànt',
      ' ' + defaultTenant.code,
    ];
    for (const code of malformedCodes) {
      await client
        .get(url(code, defaultNode.uuid, defaultMeta.key))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });

  it('should return 400 when called with bad node uuid', async () => {
    const malformedCodes = [
      '..',
      '\\..\\',
      'UUID!',
      'uùid',
      ' ' + rootNodes[0].uuid,
    ];
    for (const code of malformedCodes) {
      await client
        .get(url(defaultTenant, code, defaultMeta.key))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });

  it('should return 400 when called with bad metadata key', async () => {
    const malformedCodes = [
      '..',
      '\\..\\',
      'META!',
      'mètadàta',
      ' ' + defaultMeta.key,
    ];
    for (const code of malformedCodes) {
      await client
        .get(url(defaultTenant, defaultNode.uuid, code))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });
});
