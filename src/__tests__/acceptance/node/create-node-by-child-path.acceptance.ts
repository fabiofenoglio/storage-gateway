/* eslint-disable @typescript-eslint/no-explicit-any */
import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant, StorageNode, StorageNodeType} from '../../../models';
import {
  CreateMetadataRequest,
  CreateNodeRequest,
  CreateNodeResponse,
  ListNodesResponse,
  StorageNodeResumeDto,
} from '../../../rest';
import {PathUtils} from '../../../utils/path-utils';
import {givenInMemoryTenants, givenSomeNodes} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {setupApplication} from '../../helper/test-helper';

describe('Create node by path from another node', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let inMemoryTenants: ClientTenant[];
  let defaultTenant: ClientTenant;
  let rootNodes: StorageNode[];
  let defaultFolder: StorageNode;
  let defaultFolderPath: string;

  const url = (tenant: ClientTenant | string, uuid: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid +
    '/children';

  const nodeUrl = (tenant: ClientTenant | string, uuid: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid;

  const tenantUrl = (tenant: ClientTenant | string) =>
    '/tenant/' + (typeof tenant === 'string' ? tenant : tenant.code) + '/items';

  const fetch = async (tenant: ClientTenant | string, uuid: string) =>
    client
      .get(nodeUrl(tenant, uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(200);

  const defaultPath = '/acceptance/create-node-by-child-path';

  const defaultPayload: CreateNodeRequest = new CreateNodeRequest({
    type: 'FILE',
    name: 'test-file-000',
    metadata: [
      new CreateMetadataRequest({
        key: 'scenarioName',
        value: 'createNodeByPath',
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

    // find a level 0 folder
    const lev0Folder = rootNodes.find(o => o.type === StorageNodeType.FOLDER)!;
    const in0Folder = await givenSomeNodes(
      app,
      defaultTenant,
      2,
      1,
      lev0Folder,
    );
    const lev1Folder = in0Folder.find(o => o.type === StorageNodeType.FOLDER)!;
    const in1Folder = await givenSomeNodes(
      app,
      defaultTenant,
      2,
      1,
      lev1Folder,
    );
    defaultFolder = in1Folder.find(o => o.type === StorageNodeType.FOLDER)!;
    defaultFolderPath =
      '/' + lev0Folder.name + '/' + lev1Folder.name + '/' + defaultFolder.name;
  });

  after(async () => {
    await app.stop();
  });

  it('should return 400 or 422 on bad path', async () => {
    const badPaths = [
      '/.',
      '/..',
      '.',
      '..',
      '/../../root',
      '/asd/COM9',
      '/asd/./this',
    ];
    for (const badPath of badPaths) {
      const res = await client
        .post(url(defaultTenant, defaultFolder.uuid))
        .query({
          path: badPath,
        })
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send({
          ...defaultPayload,
        })
        .expect('Content-Type', /application\/json/);

      expect(res.status).to.equalOneOf([400, 422]);
    }
  });

  it('should return 201 OK', async () => {
    const res = await client
      .post(url(defaultTenant, defaultFolder.uuid))
      .query({
        path: defaultPath,
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...defaultPayload,
        type: StorageNodeType.FILE,
        name: 'file-attempt-001',
      })
      .expect('Content-Type', /application\/json/);

    expect(res.status).to.equal(201);
    const createdUUID = (res.body as CreateNodeResponse).uuid;

    const fetched = await fetch(defaultTenant, createdUUID);
    expect(fetched.body.uuid).to.equal(createdUUID);
  });

  it('should return 409 when attempting with same path', async () => {
    await client
      .post(url(defaultTenant, defaultFolder.uuid))
      .query({
        path: defaultPath,
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...defaultPayload,
        type: StorageNodeType.FILE,
        name: 'file-attempt-002',
      })
      .expect('Content-Type', /application\/json/)
      .expect(201);

    await client
      .post(url(defaultTenant, defaultFolder.uuid))
      .query({
        path: defaultPath,
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send({
        ...defaultPayload,
        type: StorageNodeType.FILE,
        name: 'file-attempt-002',
      })
      .expect('Content-Type', /application\/json/)
      .expect(409);
  });

  it('should create the object under the right path', async () => {
    const targetPath = defaultPath + '/check-created';
    const payload = {
      ...defaultPayload,
      type: StorageNodeType.FILE,
      name: 'file-attempt-002',
    };

    const res = await client
      .post(url(defaultTenant, defaultFolder.uuid))
      .query({
        path: targetPath,
      })
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(payload)
      .expect('Content-Type', /application\/json/);

    expect(res.status).to.equal(201);
    const createdUUID = (res.body as CreateNodeResponse).uuid;

    const splittedTokens = PathUtils.cleanPath(
      defaultFolderPath + '/' + targetPath,
    )
      .substr(1)
      .split('/')
      .concat([payload.name]);
    let currentNode: StorageNodeResumeDto | null = null;

    for (const token of splittedTokens) {
      const fetched: any = await client
        .get(
          tenantUrl(defaultTenant) +
            (currentNode ? '/' + currentNode.uuid + '/children' : ''),
        )
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect(200);

      currentNode =
        (fetched.body as ListNodesResponse).content.find(
          c => c.name === token,
        ) ?? null;
      expect(currentNode).to.not.be.undefined();
      expect(currentNode).to.not.be.null();
    }

    expect(currentNode).to.not.be.undefined();
    expect(currentNode).to.not.be.null();
    expect(currentNode!.uuid).to.equal(createdUUID);
  });
});
