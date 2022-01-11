/* eslint-disable @typescript-eslint/no-explicit-any */
import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {
  ClientTenant,
  StorageNode,
  StorageNodeShare,
  StorageNodeShareType,
  StorageNodeType,
} from '../../../models';
import {CreateNodeShareResponse} from '../../../rest';
import {
  givenInMemoryTenants,
  givenSomeNodes,
  givenSomeShare,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {setupApplication} from '../../helper/test-helper';

describe('Create node share', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let inMemoryTenants: ClientTenant[];
  let defaultTenant: ClientTenant;
  let rootNodes: StorageNode[];
  let defaultNode: StorageNode;
  let givenShare: StorageNodeShare[];

  const url = (tenant: ClientTenant | string, uuid: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid +
    '/shares';

  const defaultPayload = {
    type: StorageNodeShareType.EMBED,
  };

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    principal = givenPrincipal();
    inMemoryTenants = await givenInMemoryTenants(app, principal.profile);
    defaultTenant = inMemoryTenants[0];
    // populate default tenant
    rootNodes = await givenSomeNodes(app, defaultTenant);
    expect(rootNodes.length).to.be.greaterThan(0);
    defaultNode = rootNodes[0];

    givenShare = await givenSomeShare(app, defaultTenant, defaultNode);
    expect(givenShare.length).to.be.greaterThan(0);
  });

  after(async () => {
    await app.stop();
  });

  it('should return 401 when called without authentication', async () => {
    await client
      .post(url(defaultTenant, defaultNode.uuid))
      .send({
        ...defaultPayload,
      })
      .expect('Content-Type', /application\/json/)
      .expect(401);
  });

  it('should return 403 when called on a not-owned tenant', async () => {
    const otherTenants = await givenInMemoryTenants(app, 'otherOwner');
    const otherNodes = await givenSomeNodes(app, otherTenants[0]);
    expect(rootNodes.length).to.be.greaterThan(0);
    const rootFolder = otherNodes.find(o => o.type === StorageNodeType.FOLDER)!;

    await client
      .post(url(otherTenants[0], rootFolder.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...defaultPayload,
      })
      .expect('Content-Type', /application\/json/)
      .expect(403);
  });

  it('should return 404 when called on a missing tenant', async () => {
    await client
      .post(url('MISSINGTENANT', defaultNode.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...defaultPayload,
      })
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return 404 on missing node', async () => {
    await client
      .post(url(defaultTenant, 'MISSINGNODE'))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...defaultPayload,
      })
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return 200 OK', async () => {
    await client
      .post(url(defaultTenant, defaultNode.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...defaultPayload,
      })
      .expect('Content-Type', /application\/json/)
      .expect(201);
  });

  it('should create a share', async () => {
    const payload = {
      ...defaultPayload,
    };

    const res = await client
      .post(url(defaultTenant, defaultNode.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(201);

    const response = res.body as CreateNodeShareResponse;

    // should have uuid
    expect(response.type).to.equal(payload.type);
    expect(response).to.have.property('shareUrl');

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
        .post(url(code, defaultNode.uuid))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send({
          ...defaultPayload,
        })
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });

  it(`should return 400 with bad input data`, async () => {
    const entries = [
      {type: null},
      {type: ' '},
      {type: ''},
      {type: 'KEY!'},
      {type: '/key/../k'},
    ];
    for (const propEntry of entries) {
      const payload = {
        ...defaultPayload,
      };

      const newPayload: any = Object.assign({}, payload);
      Object.assign(newPayload, propEntry);

      const fail = await client
        .post(url(defaultTenant, defaultNode.uuid))
        .set('Content-Type', 'application/json')
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send(newPayload)
        .expect('Content-Type', /application\/json/);

      expect(fail.status).to.equalOneOf(422, 400);
      expect(fail.body.error).to.not.be.undefined();

      // create with all properties then delete
      const res = await client
        .post(url(defaultTenant, defaultNode.uuid))
        .set('Content-Type', 'application/json')
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send(payload)
        .expect(201);

      await client
        .del(
          '/tenant/' +
            defaultTenant.code +
            '/items/' +
            defaultNode.uuid +
            '/shares/' +
            res.body.uuid,
        )
        .set('Content-Type', 'application/json')
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect(204);
    }
  });

  it('should return 400 when called with bad uuid', async () => {
    const malformedCodes = [
      '..',
      '\\..\\',
      'UUID!',
      'uùid',
      ' ' + defaultNode.uuid,
    ];
    for (const code of malformedCodes) {
      await client
        .post(url(defaultTenant, code))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send({
          ...defaultPayload,
        })
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });
});
