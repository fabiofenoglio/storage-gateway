/* eslint-disable @typescript-eslint/no-explicit-any */
import {Client, expect} from '@loopback/testlab';
import {v4 as uuidv4} from 'uuid';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant, StorageNode, StorageNodeType} from '../../../models';
import {
  GetNodeResponse,
  UpdateNodeMetadataRequest,
  UpdateNodeRequest,
  UpdateNodeResponse,
} from '../../../rest';
import {givenInMemoryTenants, givenSomeNodes} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {setupApplication} from '../../helper/test-helper';

describe('Update node', () => {
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

  const buildPayload = (fetched: any) =>
    new UpdateNodeRequest({
      ...fetched,
      audit: undefined,
      metadata: fetched.metadata.map(
        (m: any) =>
          new UpdateNodeMetadataRequest({
            ...m,
          }),
      ),
    }).toJSON();

  const fetch = async (tenant: ClientTenant | string, uuid: string) =>
    (
      await client
        .get(url(tenant, uuid))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(200)
    ).body as GetNodeResponse;

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
    const existing = await fetch(defaultTenant, rootNodes[0].uuid);
    const payload = buildPayload(existing);

    const res = await client
      .put(url(defaultTenant, rootNodes[0].uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/);

    expect(res.status).to.equal(200);
  });

  it('should return 401 without authorization', async () => {
    const existing = await fetch(defaultTenant, rootNodes[0].uuid);
    const payload = buildPayload(existing);

    await client
      .put(url(defaultTenant, rootNodes[0].uuid))
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(401);
  });

  it('should return 403 on not-owned tenants', async () => {
    const otherTenants = await givenInMemoryTenants(app, 'otherOwner');
    const otherNodes = await givenSomeNodes(app, otherTenants[0]);
    expect(otherNodes.length).to.be.greaterThan(0);

    const payload = new UpdateNodeRequest({
      name: otherNodes[0].name,
    }).toJSON();

    await client
      .put(url(otherTenants[0], otherNodes[0].uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(403);
  });

  it('should return 404 on missing tenants', async () => {
    const existing = await fetch(defaultTenant, rootNodes[0].uuid);
    const payload = buildPayload(existing);

    await client
      .put(url('MISSINGTENANT', rootNodes[0].uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return 404 on missing uuid', async () => {
    const existing = await fetch(defaultTenant, rootNodes[0].uuid);
    const payload = buildPayload(existing);

    await client
      .put(url(defaultTenant, 'missinguuid'))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return all properties and hide privates', async () => {
    const existing = await fetch(defaultTenant, rootNodes[1].uuid);
    expect(existing.audit.version).to.equal(1, 'starting version should be 1');

    const payload = buildPayload(existing);

    const res = await client
      .put(url(defaultTenant, existing.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response = res.body as UpdateNodeResponse;

    // should have uuid
    expect(response.name).to.equal(existing.name);
    expect(response.type).to.equal(existing.type);
    expect(response.uuid.length).to.be.greaterThan(5);

    // check metadata
    expect(response.metadata.length).to.equal(0);

    // check audit
    expect(response.audit.version).to.equal(2, 'updated version should be 2');
    expect(response.audit.createdBy).to.equal(principal.profile.code);
    expect(new Date(response.audit.createdAt).getTime()).to.be.lessThanOrEqual(
      new Date().getTime(),
    );
    expect(
      new Date(response.audit.modifiedAt!).getTime(),
    ).to.be.lessThanOrEqual(new Date().getTime());
    expect(response.audit.modifiedBy).to.equal(principal.profile.code);

    // should hide private properties
    expect(response).to.not.have.property('id');
    expect(response).to.not.have.property('version');

    // still no content
    expect(response.content).to.be.undefined();
  });

  it('should return 400 when called with bad tenant code', async () => {
    const existing = await fetch(defaultTenant, rootNodes[0].uuid);
    const payload = buildPayload(existing);
    const malformedCodes = [
      '\\..\\',
      'TENANT!',
      'tenànt',
      ' ' + defaultTenant.code,
    ];
    for (const code of malformedCodes) {
      await client
        .put(url(code, existing.uuid))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send(payload)
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });

  it('should return 400 when called with bad uuid', async () => {
    const existing = await fetch(defaultTenant, rootNodes[0].uuid);
    const payload = buildPayload(existing);

    const malformedCodes = [
      '..',
      '\\..\\',
      'UUID!',
      'uùid',
      ' ' + rootNodes[0].uuid,
    ];
    for (const code of malformedCodes) {
      await client
        .put(url(defaultTenant, code))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send(payload)
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });

  it(`should return 400 with bad input data`, async () => {
    const existing = await fetch(defaultTenant, rootNodes[0].uuid);
    const entries = [
      {name: null},
      {name: ' '},
      {type: StorageNodeType.FILE},
      {id: 123},
      {uuid: existing.uuid},
      {type: StorageNodeType.FILE},
      {someProperty: 'someValue'},
      {metadata: [{value: 'i have no key'}]},
    ];
    for (const propEntry of entries) {
      const payload = buildPayload(Object.assign({}, existing));

      const fail = await client
        .put(url(defaultTenant, existing.uuid))
        .set('Content-Type', 'application/json')
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send(Object.assign({}, payload, propEntry))
        .expect('Content-Type', /application\/json/);

      expect(fail.status).to.equalOneOf(422, 400);
      expect(fail.body.error).to.not.be.undefined();

      // update with all properties
      await client
        .put(url(defaultTenant, existing.uuid))
        .set('Content-Type', 'application/json')
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send(payload)
        .expect(200);
    }
  });

  it('should increase version and handle audit fields', async () => {
    const existing = await fetch(defaultTenant, rootNodes[2].uuid);
    expect(existing.audit.version).to.equal(1, 'starting version should be 1');
    expect(existing.audit.modifiedBy).to.be.undefined();
    expect(existing.audit.modifiedAt).to.be.undefined();

    const payload = buildPayload(existing);

    const res = await client
      .put(url(defaultTenant, existing.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response = res.body as UpdateNodeResponse;

    // check audit
    expect(response.audit.version).to.equal(2, 'updated version should be 2');
    expect(response.audit.createdBy).to.equal(principal.profile.code);
    expect(new Date(response.audit.createdAt).getTime()).to.be.lessThanOrEqual(
      new Date().getTime(),
    );
    expect(
      new Date(response.audit.modifiedAt!).getTime(),
    ).to.be.lessThanOrEqual(new Date().getTime());
    expect(response.audit.modifiedBy).to.equal(principal.profile.code);
  });

  it('should handle optionally incoming audit.version for optimistic check', async () => {
    const existing = await fetch(defaultTenant, rootNodes[3].uuid);
    expect(existing.audit.version).to.equal(1, 'starting version should be 1');
    expect(existing.audit.modifiedBy).to.be.undefined();
    expect(existing.audit.modifiedAt).to.be.undefined();

    let payload: any = {
      ...buildPayload(existing),
    };

    const res1 = await client
      .put(url(defaultTenant, existing.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response1 = res1.body as UpdateNodeResponse;

    // check audit
    expect(response1.audit.version).to.equal(2, 'updated version should be 2');
    expect(
      new Date(response1.audit.modifiedAt!).getTime(),
    ).to.be.lessThanOrEqual(new Date().getTime());
    expect(response1.audit.modifiedBy).to.equal(principal.profile.code);

    // now call with audit in input
    payload = {
      ...buildPayload(existing),
      audit: {
        version: response1.audit.version,
      },
    };

    const res2 = await client
      .put(url(defaultTenant, existing.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response2 = res2.body as UpdateNodeResponse;

    // check audit
    expect(response2.audit.version).to.equal(3, 'updated version should be 3');
    expect(new Date(response2.audit.modifiedAt!).getTime()).to.be.greaterThan(
      new Date(response1.audit.modifiedAt!).getTime(),
    );
    expect(response2.audit.modifiedBy).to.equal(principal.profile.code);

    // now call with WRONG audit in input
    payload = {
      ...buildPayload(existing),
      audit: {
        version: response1.audit.version,
      },
    };

    await client
      .put(url(defaultTenant, existing.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(409);

    // now call with CORRECT audit in input
    payload = {
      ...buildPayload(existing),
      audit: {
        version: response2.audit.version,
      },
    };

    const res3 = await client
      .put(url(defaultTenant, existing.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response3 = res3.body as UpdateNodeResponse;

    // check audit
    expect(response3.audit.version).to.equal(4, 'updated version should be 4');
    expect(new Date(response3.audit.modifiedAt!).getTime()).to.be.greaterThan(
      new Date(response2.audit.modifiedAt!).getTime(),
    );
    expect(response3.audit.modifiedBy).to.equal(principal.profile.code);
  });

  it('should actually update the data', async () => {
    const existing = await fetch(defaultTenant, rootNodes[0].uuid);

    const payload: any = {
      ...buildPayload(existing),
      name: existing.name + '-updated-' + uuidv4(),
    };

    const res = await client
      .put(url(defaultTenant, existing.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response = res.body as UpdateNodeResponse;
    const updated = await fetch(defaultTenant, rootNodes[0].uuid);

    // check audit
    expect(response.name).to.equal(payload.name);
    expect(updated.name).to.equal(payload.name);
  });

  it('should update, insert and delete metadata', async () => {
    const existing = await fetch(defaultTenant, rootNodes[0].uuid);

    let payload: any = {
      ...buildPayload(existing),
      metadata: [
        ...existing.metadata,
        {key: 'newMetadata1', value: 'addedByIT'},
        {key: 'newMetadata2', value: true},
      ],
    };

    const res1 = await client
      .put(url(defaultTenant, existing.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response1 = res1.body as UpdateNodeResponse;
    const updated1 = await fetch(defaultTenant, rootNodes[0].uuid);

    expect(response1.metadata.length).to.equal(payload.metadata.length);
    expect(updated1.metadata.length).to.equal(payload.metadata.length);
    expect(
      response1.metadata.find(m => m.key === 'newMetadata1'),
    ).to.not.be.undefined();
    expect(
      updated1.metadata.find(m => m.key === 'newMetadata1'),
    ).to.not.be.undefined();
    expect(
      response1.metadata.find(m => m.key === 'newMetadata2')?.value,
    ).to.equal(true);
    expect(
      updated1.metadata.find(m => m.key === 'newMetadata2')?.value,
    ).to.equal(true);

    response1.metadata.forEach((m: any) =>
      expect(
        payload.metadata.find((m2: any) => m2.key === m.key)!.value,
      ).to.deepEqual(m.value),
    );
    updated1.metadata.forEach((m: any) =>
      expect(
        payload.metadata.find((m2: any) => m2.key === m.key)!.value,
      ).to.deepEqual(m.value),
    );
    payload.metadata.forEach((m: any) =>
      expect(
        response1.metadata.find(m2 => m2.key === m.key)!.value,
      ).to.deepEqual(m.value),
    );
    payload.metadata.forEach((m: any) =>
      expect(
        updated1.metadata.find(m2 => m2.key === m.key)!.value,
      ).to.deepEqual(m.value),
    );

    // add 2 and remove 1
    payload = {
      ...buildPayload(existing),
      metadata: [
        ...existing.metadata,
        {key: 'newMetadata2', value: false},
        {key: 'newMetadata3', value: 15},
        {key: 'newMetadata4', value: {a: 12, b: 13}},
      ],
    };

    const res2 = await client
      .put(url(defaultTenant, existing.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response2 = res2.body as UpdateNodeResponse;
    const updated2 = await fetch(defaultTenant, rootNodes[0].uuid);

    expect(response2.metadata.length).to.equal(payload.metadata.length);
    expect(updated2.metadata.length).to.equal(payload.metadata.length);
    expect(
      response2.metadata.find(m => m.key === 'newMetadata1'),
    ).to.be.undefined();
    expect(
      updated2.metadata.find(m => m.key === 'newMetadata1'),
    ).to.be.undefined();
    expect(
      response2.metadata.find(m => m.key === 'newMetadata2')?.value,
    ).to.equal(false);
    expect(
      updated2.metadata.find(m => m.key === 'newMetadata2')?.value,
    ).to.equal(false);

    response2.metadata.forEach((m: any) =>
      expect(
        payload.metadata.find((m2: any) => m2.key === m.key)!.value,
      ).to.deepEqual(m.value),
    );
    updated2.metadata.forEach((m: any) =>
      expect(
        payload.metadata.find((m2: any) => m2.key === m.key)!.value,
      ).to.deepEqual(m.value),
    );
    payload.metadata.forEach((m: any) =>
      expect(
        response2.metadata.find(m2 => m2.key === m.key)!.value,
      ).to.deepEqual(m.value),
    );
    payload.metadata.forEach((m: any) =>
      expect(
        updated2.metadata.find(m2 => m2.key === m.key)!.value,
      ).to.deepEqual(m.value),
    );

    // remove all
    payload = {
      ...buildPayload(existing),
      metadata: undefined,
    };

    const res3 = await client
      .put(url(defaultTenant, existing.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response3 = res3.body as UpdateNodeResponse;
    const updated3 = await fetch(defaultTenant, rootNodes[0].uuid);

    expect(response3.metadata.length).to.equal(0);
    expect(updated3.metadata.length).to.equal(0);
  });
});
