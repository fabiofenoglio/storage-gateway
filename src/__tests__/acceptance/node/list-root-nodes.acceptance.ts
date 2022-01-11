import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant, StorageNode, StorageNodeType} from '../../../models';
import {ListNodesResponse} from '../../../rest';
import {
  givenFile,
  givenFolder,
  givenInMemoryTenants,
  givenSomeNodes,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {setupApplication} from '../../helper/test-helper';

describe('List root nodes', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let inMemoryTenants: ClientTenant[];
  let defaultTenant: ClientTenant;
  let rootNodes: StorageNode[];

  const url = (tenant: ClientTenant | string) =>
    '/tenant/' + (typeof tenant === 'string' ? tenant : tenant.code) + '/items';

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    principal = givenPrincipal();
    inMemoryTenants = await givenInMemoryTenants(app, principal.profile);
    defaultTenant = inMemoryTenants[0];

    // populate default tenant
    rootNodes = await givenSomeNodes(app, defaultTenant, 10);
    expect(rootNodes.length).to.be.greaterThan(0);
  });

  after(async () => {
    await app.stop();
  });

  it('should return 200 OK', async () => {
    await client
      .get(url(defaultTenant))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);
  });

  it('should not have any nodes in non-default tenant', async () => {
    const res = await client
      .get(url(inMemoryTenants[1]))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response = res.body as ListNodesResponse;
    expect(response).to.containEql({
      content: [],
      totalElements: 0,
      totalPages: 0,
    });
    expect(response.content.length).to.equal(0);
  });

  it('should return 401 without authorization', async () => {
    await client
      .get(url(defaultTenant))
      .expect('Content-Type', /application\/json/)
      .expect(401);
  });

  it('should return 403 on not-owned tenants', async () => {
    const otherTenants = await givenInMemoryTenants(app, 'otherOwner');
    await client
      .get(url(otherTenants[0]))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(403);
  });

  it('should return 404 on missing tenants', async () => {
    await client
      .get(url('MISSINGTENANT'))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return 400 on empty or malformed tenant codes', async () => {
    const malformedCodes = [
      ' ',
      '\\..\\',
      'TENANT!',
      'tenànt',
      defaultTenant.code + ' ',
    ];
    for (const code of malformedCodes) {
      await client
        .get(url(code))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });

  it('should have some nodes in root', async () => {
    const res = await client
      .get(url(defaultTenant))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);
    const response = res.body as ListNodesResponse;

    expect(response.content.length).to.equal(rootNodes.length);

    response.content.forEach(entry => {
      expect(entry.name.length).to.be.greaterThan(0);
      expect(entry.type.length).to.be.greaterThan(2);
      expect(entry.uuid.length).to.be.greaterThan(5);

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
      expect(entry.audit).to.not.have.property('id');
    });
  });

  it('should handle pagination with page and size parameters', async () => {
    expect(rootNodes.length).to.be.greaterThanOrEqual(5);
    const reqPageSize = 4;
    const expectedTotal = 10;
    const expectedPages = 3;

    const res1 = await client
      .get(url(defaultTenant) + '?page=0&size=' + reqPageSize)
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response1 = res1.body as ListNodesResponse;
    expect(response1.totalElements).to.equal(expectedTotal);
    expect(response1.number).to.equal(0);
    expect(response1.size).to.equal(reqPageSize);
    expect(response1.numberOfElements).to.equal(reqPageSize);
    expect(response1.totalPages).to.equal(expectedPages);

    const res2 = await client
      .get(url(defaultTenant) + '?page=1&size=' + reqPageSize)
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response2 = res2.body as ListNodesResponse;
    expect(response2.totalElements).to.equal(expectedTotal);
    expect(response2.number).to.equal(1);
    expect(response2.size).to.equal(reqPageSize);
    expect(response2.numberOfElements).to.equal(reqPageSize);
    expect(response2.totalPages).to.equal(expectedPages);

    for (const dto of response2.content) {
      expect(
        response1.content.find(o => o.uuid === dto.uuid),
      ).to.be.undefined();
    }
    for (const dto of response1.content) {
      expect(
        response2.content.find(o => o.uuid === dto.uuid),
      ).to.be.undefined();
    }

    const res3 = await client
      .get(url(defaultTenant) + '?page=2&size=' + reqPageSize)
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response3 = res3.body as ListNodesResponse;
    expect(response3.totalElements).to.equal(expectedTotal);
    expect(response3.number).to.equal(2);
    expect(response3.size).to.equal(reqPageSize);
    expect(response3.numberOfElements).to.equal(expectedTotal % reqPageSize);
    expect(response3.totalPages).to.equal(expectedPages);

    for (const dto of response3.content) {
      expect(
        response2.content.find(o => o.uuid === dto.uuid),
      ).to.be.undefined();
    }
    for (const dto of response2.content) {
      expect(
        response3.content.find(o => o.uuid === dto.uuid),
      ).to.be.undefined();
    }
    for (const dto of response3.content) {
      expect(
        response1.content.find(o => o.uuid === dto.uuid),
      ).to.be.undefined();
    }
    for (const dto of response1.content) {
      expect(
        response3.content.find(o => o.uuid === dto.uuid),
      ).to.be.undefined();
    }
  });

  it('should handle pagination with only page number', async () => {
    expect(rootNodes.length).to.be.greaterThanOrEqual(5);
    const expectedTotal = 10;

    const res1 = await client
      .get(url(defaultTenant) + '?page=0')
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response1 = res1.body as ListNodesResponse;
    expect(response1.totalElements).to.equal(expectedTotal);
    expect(response1.number).to.equal(0);
    expect(response1.size).to.be.greaterThan(0);
    expect(response1.numberOfElements).to.equal(expectedTotal);
    expect(response1.totalPages).to.equal(1);

    const res2 = await client
      .get(url(defaultTenant) + '?page=1')
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response2 = res2.body as ListNodesResponse;
    expect(response2.totalElements).to.equal(expectedTotal);
    expect(response2.number).to.equal(1);
    expect(response2.size).to.be.greaterThan(0);
    expect(response2.numberOfElements).to.equal(0);
    expect(response2.totalPages).to.equal(1);
  });

  it('should handle pagination with only page size', async () => {
    expect(rootNodes.length).to.be.greaterThanOrEqual(5);
    const expectedTotal = 10;
    const reqSize = 3;
    const expectedPages = 4;

    const res1 = await client
      .get(url(defaultTenant) + '?size=' + reqSize)
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);

    const response1 = res1.body as ListNodesResponse;
    expect(response1.totalElements).to.equal(expectedTotal);
    expect(response1.number).to.equal(0);
    expect(response1.size).to.equal(reqSize);
    expect(response1.numberOfElements).to.equal(reqSize);
    expect(response1.totalPages).to.equal(expectedPages);
  });

  it('should filter by name if specified', async () => {
    // create some files
    await givenFile(app, defaultTenant, {name: 'another-file'});
    await givenFile(app, defaultTenant, {name: 'filterbyname-file-1'});
    await givenFile(app, defaultTenant, {name: 'filterbyname-file-2'});
    await givenFile(app, defaultTenant, {name: 'filterbyname-file-3'});
    await givenFolder(app, defaultTenant, {name: 'filterbyname-folder-3'});
    await givenFolder(app, defaultTenant, {name: 'filterbyname-folder-4'});

    // expect 1 element with equals
    expect(
      (
        (
          await client
            .get(
              url(defaultTenant) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({name: {equals: 'filterbyname-file-2'}}),
                ),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListNodesResponse
      ).totalElements,
    ).to.equal(1);

    // expect 0 element with equals
    expect(
      (
        (
          await client
            .get(
              url(defaultTenant) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({
                    name: {equals: 'filterbyname-file-1-MISSING'},
                  }),
                ),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListNodesResponse
      ).totalElements,
    ).to.equal(0);

    // expect 2 element with in
    expect(
      (
        (
          await client
            .get(
              url(defaultTenant) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({
                    name: {
                      in: ['filterbyname-file-1', 'filterbyname-folder-3'],
                    },
                  }),
                ),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListNodesResponse
      ).totalElements,
    ).to.equal(2);

    // expect 0 element with empty in
    expect(
      (
        (
          await client
            .get(
              url(defaultTenant) +
                '?size=100&filter=' +
                encodeURIComponent(JSON.stringify({name: {in: []}})),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListNodesResponse
      ).totalElements,
    ).to.equal(0);

    // expect 5 elements with prefix
    expect(
      (
        (
          await client
            .get(
              url(defaultTenant) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({name: {like: 'filterbyname-%'}}),
                ),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListNodesResponse
      ).totalElements,
    ).to.equal(5);

    // expect 3 elements with prefix-file
    expect(
      (
        (
          await client
            .get(
              url(defaultTenant) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({name: {like: '%terbyname-file-%'}}),
                ),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListNodesResponse
      ).totalElements,
    ).to.equal(3);

    // expect >= 6 elements with %
    expect(
      (
        (
          await client
            .get(
              url(defaultTenant) +
                '?size=100&filter=' +
                encodeURIComponent(JSON.stringify({name: {like: '%'}})),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListNodesResponse
      ).totalElements,
    ).to.be.greaterThanOrEqual(6);

    // expect >= 6 elements without filter
    expect(
      (
        (
          await client
            .get(url(defaultTenant) + '?size=100')
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListNodesResponse
      ).totalElements,
    ).to.be.greaterThanOrEqual(6);
  });

  it('should filter by type if specified', async () => {
    const tenant = inMemoryTenants[1];

    // create some files
    await givenFile(app, tenant, {name: 'another-file'});
    await givenFile(app, tenant, {name: 'filterbyname-file-1'});
    await givenFile(app, tenant, {name: 'filterbyname-file-2'});
    await givenFile(app, tenant, {name: 'filterbyname-file-3'});
    await givenFolder(app, tenant, {name: 'filterbyname-folder-3'});
    await givenFolder(app, tenant, {name: 'filterbyname-folder-4'});

    // expect 4 element with equals
    expect(
      (
        (
          await client
            .get(
              url(tenant) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({type: {equals: StorageNodeType.FILE}}),
                ),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListNodesResponse
      ).totalElements,
    ).to.equal(4);

    // expect 2 element with equals
    expect(
      (
        (
          await client
            .get(
              url(tenant) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({type: {equals: StorageNodeType.FOLDER}}),
                ),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListNodesResponse
      ).totalElements,
    ).to.equal(2);

    // expect 4 element with in
    expect(
      (
        (
          await client
            .get(
              url(tenant) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({type: {in: [StorageNodeType.FILE]}}),
                ),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListNodesResponse
      ).totalElements,
    ).to.equal(4);

    // expect 0 element with in
    expect(
      (
        (
          await client
            .get(
              url(tenant) +
                '?size=100&filter=' +
                encodeURIComponent(JSON.stringify({type: {in: []}})),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListNodesResponse
      ).totalElements,
    ).to.equal(0);

    // expect 6 element with in
    expect(
      (
        (
          await client
            .get(
              url(tenant) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({
                    type: {in: [StorageNodeType.FILE, StorageNodeType.FOLDER]},
                  }),
                ),
            )
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListNodesResponse
      ).totalElements,
    ).to.equal(6);
  });
});
