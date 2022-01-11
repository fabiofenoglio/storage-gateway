/* eslint-disable @typescript-eslint/no-explicit-any */
import {Client, expect} from '@loopback/testlab';
import {v4 as uuidv4} from 'uuid';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant, StorageNode, StorageNodeType} from '../../../models';
import {
  CreateMetadataRequest,
  CreateNodeRequest,
  CreateNodeResponse,
} from '../../../rest';
import {givenInMemoryTenants, givenSomeNodes} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {setupApplication} from '../../helper/test-helper';

describe('Create node in root', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let inMemoryTenants: ClientTenant[];
  let defaultTenant: ClientTenant;
  let rootNodes: StorageNode[];

  const url = (tenant: ClientTenant | string) =>
    '/tenant/' + (typeof tenant === 'string' ? tenant : tenant.code) + '/items';

  const defaultPayload: CreateNodeRequest = new CreateNodeRequest({
    type: 'FOLDER',
    name: 'test-file-000',
    metadata: [
      new CreateMetadataRequest({
        key: 'scenarioName',
        value: 'createNodeInRoot',
      }),
    ],
  });

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

  it('should return 201 OK', async () => {
    await client
      .post(url(defaultTenant))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...defaultPayload,
        type: StorageNodeType.FILE,
        name: 'file-' + uuidv4(),
      })
      .expect('Content-Type', /application\/json/)
      .expect(201);
  });

  it('should return 401 when called without authentication', async () => {
    await client
      .post(url(defaultTenant))
      .send({
        ...defaultPayload,
        name: 'file-' + uuidv4(),
      })
      .expect('Content-Type', /application\/json/)
      .expect(401);
  });

  it('should return 403 when called on a not-owned tenant', async () => {
    const otherTenants = await givenInMemoryTenants(app, 'otherOwner');
    await client
      .post(url(otherTenants[0]))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...defaultPayload,
        name: 'file-' + uuidv4(),
      })
      .expect('Content-Type', /application\/json/)
      .expect(403);
  });

  it('should return 404 when called on a missing tenant', async () => {
    await client
      .post(url('MISSINGTENANT'))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...defaultPayload,
        name: 'file-' + uuidv4(),
      })
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should create a file', async () => {
    const payload = {
      ...defaultPayload,
      type: StorageNodeType.FILE,
      name: 'file-' + uuidv4(),
    };

    const res = await client
      .post(url(defaultTenant))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(201);

    const response = res.body as CreateNodeResponse;

    // should have uuid
    expect(response.name).to.equal(payload.name);
    expect(response.type).to.equal(payload.type);
    expect(response.uuid.length).to.be.greaterThan(5);

    // check metadata
    expect(response.metadata[0].key).to.equal(payload.metadata![0].key);
    expect(response.metadata[0].value).to.equal(payload.metadata![0].value);

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

  it('should create a file then conflict when called again with the same name', async () => {
    const payload = {
      ...defaultPayload,
      type: StorageNodeType.FILE,
      name: 'file-' + uuidv4(),
    };

    await client
      .post(url(defaultTenant))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(201);

    await client
      .post(url(defaultTenant))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(409);

    await client
      .post(url(defaultTenant))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...payload,
        type: StorageNodeType.FOLDER,
      })
      .expect('Content-Type', /application\/json/)
      .expect(409);
  });

  it('should create a folder', async () => {
    const payload = {
      ...defaultPayload,
      type: StorageNodeType.FOLDER,
      name: 'folder-' + uuidv4(),
    };

    const res = await client
      .post(url(defaultTenant))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(201);

    const response = res.body as CreateNodeResponse;

    // should have uuid
    expect(response.name).to.equal(payload.name);
    expect(response.type).to.equal(payload.type);
    expect(response.uuid.length).to.be.greaterThan(5);

    // check metadata
    expect(response.metadata[0].key).to.equal(payload.metadata![0].key);
    expect(response.metadata[0].value).to.equal(payload.metadata![0].value);

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

  it('should create a folder then conflict when called again with the same name', async () => {
    const payload = {
      ...defaultPayload,
      type: StorageNodeType.FOLDER,
      name: 'folder-' + uuidv4(),
    };

    await client
      .post(url(defaultTenant))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(201);

    await client
      .post(url(defaultTenant))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(409);

    await client
      .post(url(defaultTenant))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...payload,
        type: StorageNodeType.FILE,
      })
      .expect('Content-Type', /application\/json/)
      .expect(409);
  });

  it(`should return 400 with bad input data`, async () => {
    const entries = [
      {name: null},
      {name: ' '},
      {type: null},
      {type: '  '},
      {type: 'INVALID'},
    ];
    for (const propEntry of entries) {
      const payload = {
        type: 'FOLDER',
        name: 'test-folder-999',
      };

      const newPayload: any = Object.assign({}, payload);
      Object.assign(newPayload, propEntry);

      const fail = await client
        .post('/tenant/' + inMemoryTenants[0].code + '/items')
        .set('Content-Type', 'application/json')
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send(newPayload)
        .expect('Content-Type', /application\/json/);

      expect(fail.status).to.equalOneOf(422, 400);
      expect(fail.body.error).to.not.be.undefined();

      // create with all properties then delete
      const res = await client
        .post('/tenant/' + inMemoryTenants[0].code + '/items')
        .set('Content-Type', 'application/json')
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send(payload)
        .expect(201);

      await client
        .del('/tenant/' + inMemoryTenants[0].code + '/items/' + res.body.uuid)
        .set('Content-Type', 'application/json')
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send(payload)
        .expect(204);
    }
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
        .post(url(code))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send({
          ...defaultPayload,
          type: StorageNodeType.FILE,
          name: 'file-' + uuidv4(),
        })
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });
});
