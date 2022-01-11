/* eslint-disable @typescript-eslint/no-explicit-any */
import {Client, expect} from '@loopback/testlab';
import {v4 as uuidv4} from 'uuid';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant} from '../../../models';
import {
  CreateNodeResponse,
  ListNodesResponse,
  StorageNodeResumeDto,
} from '../../../rest';
import {
  getResourceWithMetadata,
  givenMixedTenantConfigurations,
  TestResourceWithMetadata,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {
  setupApplication,
  tenantConfigurationsUnderTest,
} from '../../helper/test-helper';

describe('Create node by path from root with content', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let mixedTenants: ClientTenant[];

  const defaultPath = '/acceptance/create-node-by-root-path-with-content';

  const findTenant = (config: Partial<ClientTenant>) => {
    const tenant = mixedTenants.find(c => c.id === config.id);
    if (!tenant) {
      throw new Error('could not find test tenant of id ' + config.id);
    }
    return tenant;
  };

  const tenantUrl = (tenant: ClientTenant | string) =>
    '/tenant/' + (typeof tenant === 'string' ? tenant : tenant.code);

  const uploadUrl = (tenant: ClientTenant | string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/upload';

  const payloadBuilder = async (
    name?: string,
    editor?: (metadata: TestResourceWithMetadata) => void,
  ) => {
    name = name ?? 'sample-png.png';
    const res = await getResourceWithMetadata(name);
    if (editor) {
      editor(res);
    }
    return {
      resource: res,
      attachmentField: 'file',
      attachmentContent: res.content,
      attachmentOptions: {
        filename: 'original-' + res.metadata.fileName,
        contentType: res.metadata.mimeType,
      },
      data: {
        nodeName: 'node-' + uuidv4() + '-' + res.metadata.fileName,
        fileName: 'specific-' + res.metadata.fileName,
        contentType: res.metadata.mimeType,
        md5: res.metadata.md5,
        sha1: res.metadata.sha1,
        sha256: res.metadata.sha256,
        metadata: [
          {
            key: 'scenario',
            value: 'createNodeInRootWithContent',
          },
        ],
      },
    };
  };

  const nodeUrl = (tenant: ClientTenant | string, uuid: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid;

  const fetchNode = async (tenant: ClientTenant | string, uuid: string) => {
    return client
      .get(nodeUrl(tenant, uuid))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(200);
  };

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    principal = givenPrincipal();
    mixedTenants = await givenMixedTenantConfigurations(app, principal.profile);
  });

  after(async () => {
    await app.stop();
  });

  for (const tenantConfig of tenantConfigurationsUnderTest) {
    it(
      tenantConfig.name + ' - should return 400 or 422 on bad path',
      async () => {
        const defaultTenant = findTenant(tenantConfig);

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
          const payload = await payloadBuilder();
          const res = await client
            .post(uploadUrl(defaultTenant))
            .set(principal.authHeaderName, principal.authHeaderValue)
            .attach(
              payload.attachmentField,
              payload.attachmentContent,
              payload.attachmentOptions,
            )
            .field(
              'data',
              JSON.stringify({
                ...payload.data,
              }),
            )
            .query({
              path: badPath,
            })
            .expect('Content-Type', /application\/json/);

          expect(res.status).to.equalOneOf([400, 422]);
        }
      },
    );

    it(tenantConfig.name + ' - should return 201 OK', async () => {
      const defaultTenant = findTenant(tenantConfig);
      const payload = await payloadBuilder();
      const res = await client
        .post(uploadUrl(defaultTenant))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .attach(
          payload.attachmentField,
          payload.attachmentContent,
          payload.attachmentOptions,
        )
        .field(
          'data',
          JSON.stringify({
            ...payload.data,
          }),
        )
        .query({
          path: defaultPath,
        })
        .expect('Content-Type', /application\/json/);

      expect(res.status).to.equal(201);
      const createdUUID = (res.body as CreateNodeResponse).uuid;

      const fetched = await fetchNode(defaultTenant, createdUUID);
      expect(fetched.body.uuid).to.equal(createdUUID);
    });

    it(
      tenantConfig.name + ' - should return 409 when attempting with same path',
      async () => {
        const defaultTenant = findTenant(tenantConfig);
        const payload = await payloadBuilder();
        await client
          .post(uploadUrl(defaultTenant))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(
            payload.attachmentField,
            payload.attachmentContent,
            payload.attachmentOptions,
          )
          .field(
            'data',
            JSON.stringify({
              ...payload.data,
            }),
          )
          .query({
            path: defaultPath,
          })
          .expect('Content-Type', /application\/json/)
          .expect(201);

        await client
          .post(uploadUrl(defaultTenant))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(
            payload.attachmentField,
            payload.attachmentContent,
            payload.attachmentOptions,
          )
          .field(
            'data',
            JSON.stringify({
              ...payload.data,
            }),
          )
          .query({
            path: defaultPath,
          })
          .expect('Content-Type', /application\/json/)
          .expect(409);
      },
    );

    it(
      tenantConfig.name + ' - should created the object under the right path',
      async () => {
        const defaultTenant = findTenant(tenantConfig);
        const payload = await payloadBuilder();
        const targetPath = defaultPath + '/check-created';

        const res = await client
          .post(uploadUrl(defaultTenant))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(
            payload.attachmentField,
            payload.attachmentContent,
            payload.attachmentOptions,
          )
          .field(
            'data',
            JSON.stringify({
              ...payload.data,
            }),
          )
          .query({
            path: targetPath,
          })
          .expect('Content-Type', /application\/json/);

        expect(res.status).to.equal(201);
        const createdUUID = (res.body as CreateNodeResponse).uuid;

        const splittedTokens = targetPath
          .substr(1)
          .split('/')
          .concat([payload.data.nodeName]);
        let currentNode: StorageNodeResumeDto | null = null;

        for (const token of splittedTokens) {
          const fetched: any = await client
            .get(
              tenantUrl(defaultTenant) +
                (currentNode
                  ? '/items/' + currentNode.uuid + '/children'
                  : '/items'),
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
      },
    );
  }
});
