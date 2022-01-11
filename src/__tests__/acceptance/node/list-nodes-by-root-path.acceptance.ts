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

describe('List nodes by path from root', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let inMemoryTenants: ClientTenant[];
  let defaultTenant: ClientTenant;
  let rootNodes: StorageNode[];
  let defaultFolder: StorageNode;

  const defaultPath =
    '/acceptance/list-root-nodes-by-child-path/default-folder';

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

    // create nodes in deafult path
    const node1 = await givenFolder(app, defaultTenant, {name: 'acceptance'});
    const node2 = await givenFolder(app, node1, {
      name: 'list-root-nodes-by-child-path',
    });
    defaultFolder = await givenFolder(app, node2, {name: 'default-folder'});
    await givenSomeNodes(app, defaultTenant, 10, 1, defaultFolder);
  });

  after(async () => {
    await app.stop();
  });

  it('should return 200 OK', async () => {
    await client
      .get(url(defaultTenant))
      .query({
        path: defaultPath,
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);
  });

  it('should return 404 on missing path', async () => {
    await client
      .get(url(defaultTenant))
      .query({
        path: defaultPath + '/missing',
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return only nodes in that folder', async () => {
    const fold1 = await givenFolder(app, defaultFolder, {name: 'fold1-01'});
    const fold2 = await givenFolder(app, defaultFolder, {name: 'fold2'});
    await givenSomeNodes(app, defaultTenant, 10, 1, fold2);
    await givenFile(app, fold1, {name: 'file1'});
    await givenFile(app, fold1, {name: 'file2'});
    await givenFolder(app, fold1, {name: 'folder1'});
    await givenFolder(app, fold1, {name: 'folder2'});

    expect(
      (
        (
          await client
            .get(url(defaultTenant))
            .query({
              path: defaultPath + '/fold1-01',
            })
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect('Content-Type', /application\/json/)
            .expect(200)
        ).body as ListNodesResponse
      ).totalElements,
    ).to.equal(4);
  });

  it('should return 400 or 422 on bad path', async () => {
    const malformedCodes = [
      '/.',
      '/..',
      '.',
      '..',
      '/../../root',
      '/asd/COM9',
      '/asd/./this',
    ];
    for (const code of malformedCodes) {
      const res = await client
        .get(url(defaultTenant))
        .query({
          path: code,
        })
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/);

      expect(res.status).to.equalOneOf([400, 422]);
    }
  });

  it('should filter by name if specified', async () => {
    const fold1 = await givenFolder(app, defaultFolder, {name: 'fold1-02'});

    // create some files
    await givenFile(app, fold1, {name: 'another-file'});
    await givenFile(app, fold1, {name: 'filterbyname-file-1'});
    await givenFile(app, fold1, {name: 'filterbyname-file-2'});
    await givenFile(app, fold1, {name: 'filterbyname-file-3'});
    await givenFolder(app, fold1, {name: 'filterbyname-folder-3'});
    await givenFolder(app, fold1, {name: 'filterbyname-folder-4'});

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
            .query({
              path: defaultPath + '/fold1-02',
            })
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
            .query({
              path: defaultPath + '/fold1-02',
            })
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
            .query({
              path: defaultPath + '/fold1-02',
            })
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
            .query({
              path: defaultPath + '/fold1-02',
            })
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
            .query({
              path: defaultPath + '/fold1-02',
            })
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
            .query({
              path: defaultPath + '/fold1-02',
            })
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
            .query({
              path: defaultPath + '/fold1-02',
            })
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
            .query({
              path: defaultPath + '/fold1-02',
            })
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListNodesResponse
      ).totalElements,
    ).to.be.greaterThanOrEqual(6);
  });

  it('should filter by type if specified', async () => {
    const fold1 = await givenFolder(app, defaultFolder, {name: 'fold1-03'});

    // create some files
    await givenFile(app, fold1, {name: 'another-file'});
    await givenFile(app, fold1, {name: 'filterbyname-file-1'});
    await givenFile(app, fold1, {name: 'filterbyname-file-2'});
    await givenFile(app, fold1, {name: 'filterbyname-file-3'});
    await givenFolder(app, fold1, {name: 'filterbyname-folder-3'});
    await givenFolder(app, fold1, {name: 'filterbyname-folder-4'});

    // expect 4 element with equals
    expect(
      (
        (
          await client
            .get(
              url(defaultTenant) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({type: {equals: StorageNodeType.FILE}}),
                ),
            )
            .query({
              path: defaultPath + '/fold1-03',
            })
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
              url(defaultTenant) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({type: {equals: StorageNodeType.FOLDER}}),
                ),
            )
            .query({
              path: defaultPath + '/fold1-03',
            })
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
              url(defaultTenant) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({type: {in: [StorageNodeType.FILE]}}),
                ),
            )
            .query({
              path: defaultPath + '/fold1-03',
            })
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
              url(defaultTenant) +
                '?size=100&filter=' +
                encodeURIComponent(JSON.stringify({type: {in: []}})),
            )
            .query({
              path: defaultPath + '/fold1-03',
            })
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
              url(defaultTenant) +
                '?size=100&filter=' +
                encodeURIComponent(
                  JSON.stringify({
                    type: {in: [StorageNodeType.FILE, StorageNodeType.FOLDER]},
                  }),
                ),
            )
            .query({
              path: defaultPath + '/fold1-03',
            })
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(200)
        ).body as ListNodesResponse
      ).totalElements,
    ).to.equal(6);
  });
});
