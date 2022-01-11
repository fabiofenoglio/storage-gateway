import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant, StorageNode, StorageNodeMetadata} from '../../../models';
import {ListMetadataResponse} from '../../../rest';
import {
  givenInMemoryTenants,
  givenMetadata,
  givenNode,
  givenSomeMetadata,
  givenSomeNodes,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {setupApplication} from '../../helper/test-helper';

describe('List node metadata', () => {
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

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    principal = givenPrincipal();
    inMemoryTenants = await givenInMemoryTenants(app, principal.profile);
    defaultTenant = inMemoryTenants[0];
    // populate default tenant
    rootNodes = await givenSomeNodes(app, defaultTenant);
    expect(rootNodes.length).to.be.greaterThan(0);
    defaultNode = rootNodes[0];

    givenMeta = await givenSomeMetadata(app, defaultTenant, defaultNode, 10);
    expect(givenMeta.length).to.be.greaterThan(0);
  });

  after(async () => {
    await app.stop();
  });

  it('should return 200 OK', async () => {
    await client
      .get(url(defaultTenant, defaultNode.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);
  });

  it('should return 401 without authorization', async () => {
    await client
      .get(url(defaultTenant, defaultNode.uuid))
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
      .get(url('MISSINGTENANT', defaultNode.uuid))
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
        .get(url(defaultTenant, code))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });

  it('should return 404 on missing node', async () => {
    await client
      .get(url(defaultTenant, 'MISSINGNODE'))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return empty 200 when no metadata are present', async () => {
    const payload = rootNodes[1];

    const res = await client
      .get(url(defaultTenant, payload.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response = res.body as ListMetadataResponse;

    expect(response.content.length).to.equal(0);
    expect(response.totalElements).to.equal(0);
    expect(response.totalPages).to.equal(0);
  });

  it('should return all properties and hide privates', async () => {
    const payload = defaultNode;
    expect(givenMeta.length).to.be.greaterThan(0);

    const res = await client
      .get(url(defaultTenant, payload.uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response = res.body as ListMetadataResponse;

    expect(response.content.length).to.equal(givenMeta.length);

    response.content.forEach(entry => {
      // should have uuid
      expect(entry.key).to.not.be.undefined();
      expect(entry.value).to.not.be.undefined();

      // check audit
      expect(entry.audit.version).to.equal(1);
      expect(entry.audit.createdBy).to.equal(principal.profile.code);
      expect(new Date(entry.audit.createdAt).getTime()).to.be.lessThanOrEqual(
        new Date().getTime(),
      );
      expect(entry.audit.modifiedAt).to.be.undefined();
      expect(entry.audit.modifiedBy).to.be.undefined();
      expect(entry.audit.version).to.equal(1);

      // should hide private properties
      expect(entry).to.not.have.property('id');
      expect(entry).to.not.have.property('version');
    });
  });

  it('should handle pagination with page and size parameters', async () => {
    expect(givenMeta.length).to.equal(10);

    const reqPageSize = 4;
    const expectedTotal = 10;
    const expectedPages = 3;

    const res1 = await client
      .get(url(defaultTenant, defaultNode.uuid) + '?page=0&size=' + reqPageSize)
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response1 = res1.body as ListMetadataResponse;
    expect(response1.totalElements).to.equal(expectedTotal);
    expect(response1.number).to.equal(0);
    expect(response1.size).to.equal(reqPageSize);
    expect(response1.numberOfElements).to.equal(reqPageSize);
    expect(response1.totalPages).to.equal(expectedPages);

    const res2 = await client
      .get(url(defaultTenant, defaultNode.uuid) + '?page=1&size=' + reqPageSize)
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response2 = res2.body as ListMetadataResponse;
    expect(response2.totalElements).to.equal(expectedTotal);
    expect(response2.number).to.equal(1);
    expect(response2.size).to.equal(reqPageSize);
    expect(response2.numberOfElements).to.equal(reqPageSize);
    expect(response2.totalPages).to.equal(expectedPages);

    for (const dto of response2.content) {
      expect(response1.content.find(o => o.key === dto.key)).to.be.undefined();
    }
    for (const dto of response1.content) {
      expect(response2.content.find(o => o.key === dto.key)).to.be.undefined();
    }

    const res3 = await client
      .get(url(defaultTenant, defaultNode.uuid) + '?page=2&size=' + reqPageSize)
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response3 = res3.body as ListMetadataResponse;
    expect(response3.totalElements).to.equal(expectedTotal);
    expect(response3.number).to.equal(2);
    expect(response3.size).to.equal(reqPageSize);
    expect(response3.numberOfElements).to.equal(expectedTotal % reqPageSize);
    expect(response3.totalPages).to.equal(expectedPages);

    for (const dto of response3.content) {
      expect(response2.content.find(o => o.key === dto.key)).to.be.undefined();
    }
    for (const dto of response2.content) {
      expect(response3.content.find(o => o.key === dto.key)).to.be.undefined();
    }
    for (const dto of response3.content) {
      expect(response1.content.find(o => o.key === dto.key)).to.be.undefined();
    }
    for (const dto of response1.content) {
      expect(response3.content.find(o => o.key === dto.key)).to.be.undefined();
    }
  });

  it('should handle pagination with only page number', async () => {
    expect(givenMeta.length).to.equal(10);
    const expectedTotal = givenMeta.length;

    const res1 = await client
      .get(url(defaultTenant, defaultNode.uuid) + '?page=0')
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response1 = res1.body as ListMetadataResponse;
    expect(response1.totalElements).to.equal(expectedTotal);
    expect(response1.number).to.equal(0);
    expect(response1.size).to.be.greaterThan(0);
    expect(response1.numberOfElements).to.equal(expectedTotal);
    expect(response1.totalPages).to.equal(1);

    const res2 = await client
      .get(url(defaultTenant, defaultNode.uuid) + '?page=1')
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response2 = res2.body as ListMetadataResponse;
    expect(response2.totalElements).to.equal(expectedTotal);
    expect(response2.number).to.equal(1);
    expect(response2.size).to.be.greaterThan(0);
    expect(response2.numberOfElements).to.equal(0);
    expect(response2.totalPages).to.equal(1);
  });

  it('should handle pagination with only page size', async () => {
    expect(givenMeta.length).to.equal(10);
    const expectedTotal = givenMeta.length;
    const reqSize = 3;
    const expectedPages = 4;

    const res1 = await client
      .get(url(defaultTenant, defaultNode.uuid) + '?size=' + reqSize)
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response1 = res1.body as ListMetadataResponse;
    expect(response1.totalElements).to.equal(expectedTotal);
    expect(response1.number).to.equal(0);
    expect(response1.size).to.equal(reqSize);
    expect(response1.numberOfElements).to.equal(reqSize);
    expect(response1.totalPages).to.equal(expectedPages);
  });

  it('should filter by key when provided', async () => {
    // new node
    const node = await givenNode(app, defaultTenant);
    await givenMetadata(app, node, {key: 'test-metadata-a-1'});
    await givenMetadata(app, node, {key: 'test-metadata-a-2'});
    await givenMetadata(app, node, {key: 'test-metadata-a-3'});
    await givenMetadata(app, node, {key: 'test-metadata-b-1'});
    await givenMetadata(app, node, {key: 'test-metadata-b-2'});
    await givenMetadata(app, node, {key: 'test-metadata-b-3'});

    expect(
      (
        (
          await client
            .get(
              url(defaultTenant, node.uuid) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({key: {equals: 'test-metadata-a-1'}}),
                ),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListMetadataResponse
      ).totalElements,
    ).to.equal(1);

    expect(
      (
        (
          await client
            .get(
              url(defaultTenant, node.uuid) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({key: {equals: 'test-metadata-a-1-MISSING'}}),
                ),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListMetadataResponse
      ).totalElements,
    ).to.equal(0);

    expect(
      (
        (
          await client
            .get(
              url(defaultTenant, node.uuid) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({key: {in: ['test-metadata-a-1']}}),
                ),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListMetadataResponse
      ).totalElements,
    ).to.equal(1);

    expect(
      (
        (
          await client
            .get(
              url(defaultTenant, node.uuid) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({
                    key: {in: ['test-metadata-a-1', 'test-metadata-b-2']},
                  }),
                ),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListMetadataResponse
      ).totalElements,
    ).to.equal(2);

    expect(
      (
        (
          await client
            .get(
              url(defaultTenant, node.uuid) +
                '?size=100&filter=' +
                encodeURIComponent(JSON.stringify({key: {in: []}})),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListMetadataResponse
      ).totalElements,
    ).to.equal(0);

    expect(
      (
        (
          await client
            .get(
              url(defaultTenant, node.uuid) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({key: {like: 'test-metadata-%-1'}}),
                ),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListMetadataResponse
      ).totalElements,
    ).to.equal(2);

    expect(
      (
        (
          await client
            .get(
              url(defaultTenant, node.uuid) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({key: {like: '-metadata-b-'}}),
                ),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListMetadataResponse
      ).totalElements,
    ).to.equal(3);
  });
});
