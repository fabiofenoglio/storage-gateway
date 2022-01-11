import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant, StorageNode} from '../../../models';
import {GetNodeResponse} from '../../../rest';
import {
  givenFolder,
  givenInMemoryTenants,
  givenSomeNodes,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {setupApplication} from '../../helper/test-helper';

describe('Get node by path from another node', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let inMemoryTenants: ClientTenant[];
  let defaultTenant: ClientTenant;
  let rootNodes: StorageNode[];
  let defaultStartingNode: StorageNode;
  let defaultFolder: StorageNode;
  let defaultNode: StorageNode;

  const defaultSubpath = '/get-sub-node-by-child-path/default-folder';
  const defaultFilename = 'default-file';

  const url = (tenant: ClientTenant | string, uuid: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid;

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
    defaultStartingNode = await givenFolder(app, node1, {name: 'subfolder'});
    const node2 = await givenFolder(app, defaultStartingNode, {
      name: 'get-sub-node-by-child-path',
    });
    defaultFolder = await givenFolder(app, node2, {name: 'default-folder'});
    await givenSomeNodes(app, defaultTenant, 10, 1, defaultFolder);

    defaultNode = await givenFolder(app, defaultFolder, {
      name: defaultFilename,
    });
  });

  after(async () => {
    await app.stop();
  });

  it('should return 200 OK', async () => {
    await client
      .get(url(defaultTenant, defaultStartingNode.uuid))
      .query({
        path: defaultSubpath + '/' + defaultFilename,
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(200);
  });

  it('should return 401 without authorization', async () => {
    await client
      .get(url(defaultTenant, defaultStartingNode.uuid))
      .query({
        path: defaultSubpath + '/' + defaultFilename,
      })
      .expect('Content-Type', /application\/json/)
      .expect(401);
  });

  it('should return 404 on missing path', async () => {
    await client
      .get(url(defaultTenant, defaultStartingNode.uuid))
      .query({
        path: defaultSubpath + '/missing-file',
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return 400 when called with bad path', async () => {
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
        .get(url(defaultTenant, defaultStartingNode.uuid))
        .query({
          path: code,
        })
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });

  it('should return the correct node', async () => {
    const fetchedWithDirectGET = (
      await client
        .get(url(defaultTenant, defaultNode.uuid))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(200)
    ).body as GetNodeResponse;

    const fetched = (
      await client
        .get(url(defaultTenant, defaultStartingNode.uuid))
        .query({
          path: defaultSubpath + '/' + defaultFilename,
        })
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(200)
    ).body as GetNodeResponse;

    expect(fetched.uuid).to.equal(defaultNode.uuid);
    expect(fetched.uuid).to.equal(fetchedWithDirectGET.uuid);
    expect(fetchedWithDirectGET.uuid).to.equal(defaultNode.uuid);
  });
});
