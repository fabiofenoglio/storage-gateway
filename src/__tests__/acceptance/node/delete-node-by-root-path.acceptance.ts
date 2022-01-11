/* eslint-disable @typescript-eslint/no-explicit-any */
import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant, StorageNode} from '../../../models';
import {
  givenFile,
  givenFolder,
  givenInMemoryTenants,
  givenSomeNodes,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {setupApplication} from '../../helper/test-helper';

describe('Delete node by path from root', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let inMemoryTenants: ClientTenant[];
  let defaultTenant: ClientTenant;
  let rootNodes: StorageNode[];
  let defaultFolder: StorageNode;

  const defaultPath =
    '/acceptance/delete-root-nodes-by-child-path/default-folder';

  const url = (tenant: ClientTenant | string) =>
    '/tenant/' + (typeof tenant === 'string' ? tenant : tenant.code) + '/items';

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    principal = givenPrincipal();
    inMemoryTenants = await givenInMemoryTenants(app, principal.profile);
    defaultTenant = inMemoryTenants[0];

    // populate default tenant
    rootNodes = await givenSomeNodes(app, defaultTenant);
    expect(rootNodes.length).to.be.greaterThan(0);

    // create nodes in deafult path
    const node1 = await givenFolder(app, defaultTenant, {name: 'acceptance'});
    const node2 = await givenFolder(app, node1, {
      name: 'delete-root-nodes-by-child-path',
    });
    defaultFolder = await givenFolder(app, node2, {name: 'default-folder'});
    await givenSomeNodes(app, defaultTenant, 10, 1, defaultFolder);
  });

  after(async () => {
    await app.stop();
  });

  it('should return 404 on missing path', async () => {
    await client
      .delete(url(defaultTenant))
      .query({
        path: defaultPath + '/missing',
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return 400 or 422 when called with bad path', async () => {
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
      await client
        .delete(url(defaultTenant))
        .query({
          path: code,
        })
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });

  it('should return 200 OK', async () => {
    await givenFile(app, defaultFolder, {name: 'file-01'});
    await client
      .delete(url(defaultTenant))
      .query({
        path: defaultPath + '/file-01',
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(204);
  });

  it('should not allow to retrieve deleted elements with get by uuid', async () => {
    const createdFile = await givenFile(app, defaultFolder, {name: 'file-02'});
    await client
      .get(url(defaultTenant) + '/' + createdFile.uuid)
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(200);

    await client
      .delete(url(defaultTenant))
      .query({
        path: defaultPath + '/file-02',
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(204);

    await client
      .get(url(defaultTenant) + '/' + createdFile.uuid)
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(404);
  });

  it('should not allow to retrieve deleted elements with listing', async () => {
    const createdFile = await givenFile(app, defaultFolder, {name: 'file-03'});
    const res1 = await client
      .get(
        '/tenant/' +
          defaultTenant.code +
          '/items/' +
          defaultFolder.uuid +
          '/children',
      )
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(200);

    expect(
      res1.body.content.find((o: any) => o.uuid === createdFile.uuid),
    ).to.not.be.undefined();

    await client
      .delete(url(defaultTenant))
      .query({
        path: defaultPath + '/file-03',
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(204);

    const res2 = await client
      .get(
        '/tenant/' +
          defaultTenant.code +
          '/items/' +
          defaultFolder.uuid +
          '/children',
      )
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(200);

    expect(
      res2.body.content.find((o: any) => o.uuid === createdFile.uuid),
    ).to.be.undefined();
  });

  it('should not allow to delete again', async () => {
    await givenFile(app, defaultFolder, {name: 'file-04'});
    await client
      .delete(url(defaultTenant))
      .query({
        path: defaultPath + '/file-04',
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(204);

    await client
      .delete(url(defaultTenant))
      .query({
        path: defaultPath + '/file-04',
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(404);
  });
});
