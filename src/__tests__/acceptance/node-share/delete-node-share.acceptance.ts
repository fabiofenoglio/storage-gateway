/* eslint-disable @typescript-eslint/no-explicit-any */
import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant, StorageNode, StorageNodeShare} from '../../../models';
import {
  givenInMemoryTenants,
  givenSomeNodes,
  givenSomeShare,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {setupApplication} from '../../helper/test-helper';

describe('Delete node share', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let inMemoryTenants: ClientTenant[];
  let defaultTenant: ClientTenant;
  let rootNodes: StorageNode[];
  let defaultNode: StorageNode;
  let givenShares: StorageNodeShare[];
  let defaultShare: StorageNodeShare;

  const url = (tenant: ClientTenant | string, uuid: string, key: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid +
    '/shares/' +
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

    givenShares = await givenSomeShare(app, defaultTenant, defaultNode);
    expect(givenShares.length).to.be.greaterThan(0);
    defaultShare = givenShares[0];
  });

  after(async () => {
    await app.stop();
  });

  it('should return 204 No content', async () => {
    await client
      .delete(url(defaultTenant, defaultNode.uuid, defaultShare.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(204);
  });

  it('should return 401 without authorization', async () => {
    await client
      .delete(url(defaultTenant, defaultNode.uuid, defaultShare.uuid))
      .expect('Content-Type', /application\/json/)
      .expect(401);
  });

  it('should return 403 on not-owned tenants', async () => {
    const otherTenants = await givenInMemoryTenants(app, 'otherOwner');
    const otherNodes = await givenSomeNodes(app, otherTenants[0]);
    expect(rootNodes.length).to.be.greaterThan(0);
    const otherMeta = await givenSomeShare(app, otherTenants[0], otherNodes[0]);
    expect(otherMeta.length).to.be.greaterThan(0);

    await client
      .delete(url(otherTenants[0], otherNodes[0].uuid, otherMeta[0].uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(403);
  });

  it('should return 404 on missing tenants', async () => {
    await client
      .delete(url('MISSINGTENANT', defaultNode.uuid, defaultShare.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return 404 on missing uuid', async () => {
    await client
      .delete(url(defaultTenant, 'missinguuid', defaultShare.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return 404 on missing key', async () => {
    await client
      .delete(url(defaultTenant, defaultNode.uuid, 'missingKey'))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(404);
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
        .delete(url(code, defaultNode.uuid, defaultShare.uuid))
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
        .delete(url(defaultTenant, code, defaultShare.uuid))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });

  it('should return 400 when called with bad share key', async () => {
    const malformedCodes = [
      '..',
      '\\..\\',
      'META!',
      'mètadàta',
      ' ' + defaultShare.uuid,
    ];
    for (const code of malformedCodes) {
      await client
        .delete(url(defaultTenant, defaultNode.uuid, code))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });

  it('should not allow to retrieve deleted elements with get by uuid', async () => {
    const subject = givenShares[2];
    await client
      .get(url(defaultTenant, defaultNode.uuid, subject.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(200);

    await client
      .delete(url(defaultTenant, defaultNode.uuid, subject.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(204);

    await client
      .get(url(defaultTenant, defaultNode.uuid, subject.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(404);
  });

  it('should not allow to retrieve deleted elements with listing', async () => {
    const subject = givenShares[3];
    const res1 = await client
      .get(
        '/tenant/' +
          defaultTenant.code +
          '/items/' +
          defaultNode.uuid +
          '/shares',
      )
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(200);

    expect(
      res1.body.content.find((o: any) => o.uuid === subject.uuid),
    ).to.not.be.undefined();

    await client
      .delete(url(defaultTenant, defaultNode.uuid, subject.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(204);

    const res2 = await client
      .get(
        '/tenant/' +
          defaultTenant.code +
          '/items/' +
          defaultNode.uuid +
          '/shares',
      )
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(200);

    expect(
      res2.body.content.find((o: any) => o.key === subject.uuid),
    ).to.be.undefined();
  });

  it('should not allow to delete again', async () => {
    const subject = givenShares[4];
    await client
      .delete(url(defaultTenant, defaultNode.uuid, subject.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(204);

    await client
      .delete(url(defaultTenant, defaultNode.uuid, subject.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(404);
  });
});
