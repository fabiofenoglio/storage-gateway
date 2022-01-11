/* eslint-disable @typescript-eslint/no-explicit-any */
import {Client, expect} from '@loopback/testlab';
import {v4 as uuidv4} from 'uuid';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant, StorageNode, StorageNodeMetadata} from '../../../models';
import {GetMetadataResponse, UpdateMetadataResponse} from '../../../rest';
import {
  givenInMemoryTenants,
  givenSomeMetadata,
  givenSomeNodes,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {setupApplication} from '../../helper/test-helper';

describe('Update node metadata', () => {
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

  const buildPayload = (fetched: any) => {
    return {
      value: fetched.value,
    };
  };

  const fetch = async (
    tenant: ClientTenant | string,
    uuid: string,
    key: string,
  ) =>
    (
      await client
        .get(url(tenant, uuid, key))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(200)
    ).body as GetMetadataResponse;

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
    const existing = await fetch(
      defaultTenant,
      defaultNode.uuid,
      defaultMeta.key,
    );
    await client
      .put(url(defaultTenant, defaultNode.uuid, defaultMeta.key))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...buildPayload(existing),
      })
      .expect('Content-Type', /application\/json/)
      .expect(200);
  });

  it('should return 401 without authorization', async () => {
    const existing = await fetch(
      defaultTenant,
      defaultNode.uuid,
      defaultMeta.key,
    );
    await client
      .put(url(defaultTenant, defaultNode.uuid, defaultMeta.key))
      .send({
        ...buildPayload(existing),
      })
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
      .put(url(otherTenants[0], otherNodes[0].uuid, otherMeta[0].key))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...buildPayload(otherMeta[0]),
      })
      .expect('Content-Type', /application\/json/)
      .expect(403);
  });

  it('should return 404 on missing tenants', async () => {
    const existing = await fetch(
      defaultTenant,
      defaultNode.uuid,
      defaultMeta.key,
    );
    await client
      .put(url('MISSINGTENANT', defaultNode.uuid, defaultMeta.key))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...buildPayload(existing),
      })
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return 404 on missing uuid', async () => {
    const existing = await fetch(
      defaultTenant,
      defaultNode.uuid,
      defaultMeta.key,
    );
    await client
      .put(url(defaultTenant, 'missinguuid', defaultMeta.key))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...buildPayload(existing),
      })
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return 404 on missing key', async () => {
    const existing = await fetch(
      defaultTenant,
      defaultNode.uuid,
      defaultMeta.key,
    );
    await client
      .put(url(defaultTenant, defaultNode.uuid, 'missingKey'))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...buildPayload(existing),
      })
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return all properties and hide privates', async () => {
    const subject = givenMeta[1];
    const existing = await fetch(defaultTenant, defaultNode.uuid, subject.key);
    const res = await client
      .put(url(defaultTenant, defaultNode.uuid, subject.key))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...buildPayload(existing),
      })
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response = res.body as GetMetadataResponse;

    // should have uuid
    expect(response.key).to.equal(subject.key);
    expect(response.value).to.deepEqual(subject.value);

    // check audit
    expect(response.audit.version).to.equal(2);
    expect(response.audit.createdBy).to.equal(principal.profile.code);
    expect(response.audit.modifiedBy).to.equal(principal.profile.code);
    expect(new Date(response.audit.createdAt).getTime()).to.be.lessThanOrEqual(
      new Date().getTime(),
    );
    expect(
      new Date(response.audit.modifiedAt!).getTime(),
    ).to.be.lessThanOrEqual(new Date().getTime());

    // should hide private properties
    expect(response).to.not.have.property('id');
    expect(response).to.not.have.property('version');
  });

  it('should return 400 when called with bad tenant code', async () => {
    const existing = await fetch(
      defaultTenant,
      defaultNode.uuid,
      defaultMeta.key,
    );
    const malformedCodes = [
      '\\..\\',
      'TENANT!',
      'tenànt',
      ' ' + defaultTenant.code,
    ];
    for (const code of malformedCodes) {
      await client
        .put(url(code, defaultNode.uuid, defaultMeta.key))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send({
          ...buildPayload(existing),
        })
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });

  it('should return 400 when called with bad node uuid', async () => {
    const existing = await fetch(
      defaultTenant,
      defaultNode.uuid,
      defaultMeta.key,
    );
    const malformedCodes = [
      '..',
      '\\..\\',
      'UUID!',
      'uùid',
      ' ' + rootNodes[0].uuid,
    ];
    for (const code of malformedCodes) {
      await client
        .put(url(defaultTenant, code, defaultMeta.key))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send({
          ...buildPayload(existing),
        })
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });

  it('should return 400 when called with bad metadata key', async () => {
    const existing = await fetch(
      defaultTenant,
      defaultNode.uuid,
      defaultMeta.key,
    );
    const malformedCodes = [
      '..',
      '\\..\\',
      'META!',
      'mètadàta',
      ' ' + defaultMeta.key,
    ];
    for (const code of malformedCodes) {
      await client
        .put(url(defaultTenant, defaultNode.uuid, code))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send({
          ...buildPayload(existing),
        })
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });

  it('should increase version and handle audit fields', async () => {
    const subject = givenMeta[2];
    const existing = await fetch(defaultTenant, defaultNode.uuid, subject.key);

    expect(existing.audit.version).to.equal(1, 'starting version should be 1');
    expect(existing.audit.modifiedBy).to.be.undefined();
    expect(existing.audit.modifiedAt).to.be.undefined();

    const payload = buildPayload(existing);

    const res = await client
      .put(url(defaultTenant, defaultNode.uuid, existing.key))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response = res.body as UpdateMetadataResponse;

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
    const subject = givenMeta[3];
    const existing = await fetch(defaultTenant, defaultNode.uuid, subject.key);

    expect(existing.audit.version).to.equal(1, 'starting version should be 1');
    expect(existing.audit.modifiedBy).to.be.undefined();
    expect(existing.audit.modifiedAt).to.be.undefined();

    let payload: any = {
      ...buildPayload(existing),
    };

    const res1 = await client
      .put(url(defaultTenant, defaultNode.uuid, existing.key))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response1 = res1.body as UpdateMetadataResponse;

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
      .put(url(defaultTenant, defaultNode.uuid, existing.key))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response2 = res2.body as UpdateMetadataResponse;

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
      .put(url(defaultTenant, defaultNode.uuid, existing.key))
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
      .put(url(defaultTenant, defaultNode.uuid, existing.key))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response3 = res3.body as UpdateMetadataResponse;

    // check audit
    expect(response3.audit.version).to.equal(4, 'updated version should be 4');
    expect(new Date(response3.audit.modifiedAt!).getTime()).to.be.greaterThan(
      new Date(response2.audit.modifiedAt!).getTime(),
    );
    expect(response3.audit.modifiedBy).to.equal(principal.profile.code);
  });

  it('should actually update the data', async () => {
    const subject = givenMeta[0];
    const existing = await fetch(defaultTenant, defaultNode.uuid, subject.key);

    const payload: any = {
      ...buildPayload(existing),
      value: 'updated-' + uuidv4(),
    };

    const res = await client
      .put(url(defaultTenant, defaultNode.uuid, existing.key))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response = res.body as UpdateMetadataResponse;
    const updated = await fetch(defaultTenant, defaultNode.uuid, existing.key);

    // check audit
    expect(response.value).to.deepEqual(payload.value);
    expect(updated.value).to.deepEqual(payload.value);
  });
});
