/* eslint-disable @typescript-eslint/no-explicit-any */
import {Client, expect} from '@loopback/testlab';
import {v4 as uuidv4} from 'uuid';
import {StorageGatewayApplication} from '../../../application';
import {
  ClientTenant,
  StorageNode,
  StorageNodeMetadata,
  StorageNodeType,
} from '../../../models';
import {CreateMetadataResponse} from '../../../rest';
import {
  givenInMemoryTenants,
  givenSomeMetadata,
  givenSomeNodes,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {setupApplication} from '../../helper/test-helper';

describe('Create node metadata', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let inMemoryTenants: ClientTenant[];
  let defaultTenant: ClientTenant;
  let rootNodes: StorageNode[];
  let defaultNode: StorageNode;
  let givenMeta: StorageNodeMetadata[];

  const url = (tenant: ClientTenant | string, uuid: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid +
    '/metadata';

  const defaultPayload = {
    key: 'scenarioName',
    value: 'createMetadata',
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

    givenMeta = await givenSomeMetadata(app, defaultTenant, defaultNode);
    expect(givenMeta.length).to.be.greaterThan(0);
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
        key: 'metadata-' + uuidv4(),
        value: uuidv4(),
      })
      .expect('Content-Type', /application\/json/)
      .expect(201);
  });

  it('should create a metadata', async () => {
    const payload = {
      ...defaultPayload,
      key: 'metadata-' + uuidv4(),
      value: uuidv4(),
    };

    const res = await client
      .post(url(defaultTenant, defaultNode.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(201);

    const response = res.body as CreateMetadataResponse;

    // should have uuid
    expect(response.key).to.equal(payload.key);
    expect(response.value).to.equal(payload.value);

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

  it('should conflict with 409 on existing key', async () => {
    const payload = {
      ...defaultPayload,
      key: 'metadata-' + uuidv4(),
      value: uuidv4(),
    };

    await client
      .post(url(defaultTenant, defaultNode.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(201);

    await client
      .post(url(defaultTenant, defaultNode.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(409);
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
      {key: null},
      {key: ' '},
      {key: ''},
      {key: 'KEY!'},
      {key: '/key/../k'},
    ];
    for (const propEntry of entries) {
      const payload = {
        ...defaultPayload,
        key: 'metadata-' + uuidv4(),
        value: uuidv4(),
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
            '/metadata/' +
            res.body.key,
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
          key: 'metadata-' + uuidv4(),
          value: uuidv4(),
        })
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });
});
