/* eslint-disable @typescript-eslint/no-explicit-any */
import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant, StorageNode} from '../../../models';
import {
  GetNodeResponse,
  UpdateNodeMetadataRequest,
  UpdateNodeRequest,
} from '../../../rest';
import {
  givenFile,
  givenFolder,
  givenInMemoryTenants,
  givenSomeNodes,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {setupApplication} from '../../helper/test-helper';

describe('Update node by path from root', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let inMemoryTenants: ClientTenant[];
  let defaultTenant: ClientTenant;
  let rootNodes: StorageNode[];
  let defaultFolder: StorageNode;
  let defaultNode: StorageNode;

  const url = (tenant: ClientTenant | string) =>
    '/tenant/' + (typeof tenant === 'string' ? tenant : tenant.code) + '/items';

  const defaultPath =
    '/acceptance/update-root-nodes-by-child-path/default-folder';

  const buildPayload = (fetched: any) =>
    new UpdateNodeRequest({
      ...fetched,
      audit: undefined,
      metadata: (fetched.metadata ?? []).map(
        (m: any) =>
          new UpdateNodeMetadataRequest({
            ...m,
          }),
      ),
    }).toJSON();

  const fetch = async (tenant: ClientTenant | string, uuid: string) =>
    (
      await client
        .get(url(tenant) + '/' + uuid)
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

    // create nodes in deafult path
    const node1 = await givenFolder(app, defaultTenant, {name: 'acceptance'});
    const node2 = await givenFolder(app, node1, {
      name: 'update-root-nodes-by-child-path',
    });
    defaultFolder = await givenFolder(app, node2, {name: 'default-folder'});
    await givenSomeNodes(app, defaultTenant, 10, 1, defaultFolder);

    defaultNode = await givenFile(app, defaultFolder, {name: 'file-000'});
  });

  after(async () => {
    await app.stop();
  });

  it('should return 200 OK', async () => {
    // create some nodes
    const existing = await givenFile(app, defaultFolder, {name: 'file-01-01'});
    await givenFile(app, defaultFolder, {name: 'file-01-02'});

    const payload = buildPayload(existing);

    const res = await client
      .put(url(defaultTenant))
      .query({
        path: defaultPath + '/file-01-01',
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/);

    expect(res.status).to.equal(200);
  });

  it('should return 404 on missing path', async () => {
    const payload = buildPayload(defaultNode);

    await client
      .put(url(defaultTenant))
      .query({
        path: defaultPath + '/missingpath',
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return 400 when called with bad path', async () => {
    const payload = buildPayload(defaultNode);

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
        .put(url(defaultTenant))
        .query({
          path: code,
        })
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send(payload)
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });

  it('should act on the correct node', async () => {
    // create some nodes
    const existing = await givenFile(app, defaultFolder, {name: 'file-02-01'});
    await givenFile(app, defaultFolder, {name: 'file-02-02'});

    const fetchedBefore = await fetch(defaultTenant, existing.uuid);
    expect(fetchedBefore.parent).to.equal(defaultFolder.uuid);
    expect(fetchedBefore.name).to.equal(existing.name);

    const payload = {
      ...buildPayload(existing),
      name: 'file-02-01-updated',
    };

    const res = await client
      .put(url(defaultTenant))
      .query({
        path: defaultPath + '/file-02-01',
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/);

    expect(res.status).to.equal(200);

    const fetchedAfter = await fetch(defaultTenant, existing.uuid);
    expect(fetchedAfter.parent).to.equal(defaultFolder.uuid);
    expect(fetchedAfter.name).to.equal(payload.name);
  });
});
