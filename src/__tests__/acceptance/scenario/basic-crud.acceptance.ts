/* eslint-disable @typescript-eslint/no-explicit-any */
import {Client, expect} from '@loopback/testlab';
import {v4 as uuidv4} from 'uuid';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant, StorageNodeType} from '../../../models';
import {
  CreateContentResponse,
  CreateNodeResponse,
  GetNodeResponse,
  ListNodesResponse,
} from '../../../rest';
import {Constants} from '../../../utils';
import {givenMixedTenantConfigurations} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {
  setupApplication,
  tenantConfigurationsUnderTest,
} from '../../helper/test-helper';

describe('Basic CRUD scenario', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let mixedTenants: ClientTenant[];

  const defaultFileContent = Buffer.from([1, 2, 3, 4]);
  const defaultPayload = {
    field: 'file',
    content: defaultFileContent,
    options: {
      filename: 'test-' + uuidv4() + '.txt',
      contentType: 'application/octet-stream',
    },
  };

  const findTenant = (config: Partial<ClientTenant>) => {
    const tenant = mixedTenants.find(c => c.id === config.id);
    if (!tenant) {
      throw new Error('could not find test tenant of id ' + config.id);
    }
    return tenant;
  };

  const listRootNodes = (tenant: ClientTenant) =>
    client
      .get('/tenant/' + tenant.code + '/items')
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect('Content-Type', /application\/json/);

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
      tenantConfig.name + ' - should return 200 OK when listing root',
      async () => {
        const tenant = findTenant(tenantConfig);
        await listRootNodes(tenant).expect(200);
      },
    );

    it(tenantConfig.name + ' - should not have any nodes in root', async () => {
      const t = findTenant(tenantConfig);
      const res = await listRootNodes(t).expect(200);
      const response = res.body as ListNodesResponse;

      expect(response.content.length).to.equal(0);
    });

    it(tenantConfig.name + ' - should create a folder in root', async () => {
      const payload = {
        type: 'FOLDER',
        name: 'test-folder-000',
        metadata: [
          {
            key: 'scenarioName',
            value: 'basic CRUD',
          },
        ],
      };

      const t = findTenant(tenantConfig);
      const res = await client
        .post('/tenant/' + t.code + '/items')
        .set('Content-Type', 'application/json')
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send(payload)
        .expect('Content-Type', /application\/json/)
        .expect(201);

      const response = res.body as CreateNodeResponse;

      // should have uuid
      expect(response.name).to.equal(payload.name);
      expect(response.type).to.equal(payload.type);
      expect(response.metadata[0].key).to.equal(payload.metadata[0].key);
      expect(response.metadata[0].value).to.equal(payload.metadata[0].value);
      expect(response.uuid.length).to.be.greaterThan(5);
      expect(response.audit.version).to.equal(1);
      expect(response.audit.createdBy).to.equal(principal.profile.code);
      expect(
        new Date(response.audit.createdAt).getTime(),
      ).to.be.lessThanOrEqual(new Date().getTime());
      expect(response.audit.modifiedAt).to.be.undefined();
      expect(response.audit.modifiedBy).to.be.undefined();
      expect(response.content).to.be.undefined();
      expect(response.audit.version).to.equal(1);

      // should hide private properties
      expect(response).to.not.have.property('id');
    });

    [
      {name: null},
      {name: ' '},
      {type: null},
      {type: '  '},
      {type: 'INVALID'},
    ].forEach(propEntry => {
      it(
        tenantConfig.name +
          ` - should not create a node in root with "${JSON.stringify(
            propEntry,
          )}"`,
        async () => {
          const t = findTenant(tenantConfig);
          const payload = {
            type: 'FOLDER',
            name: 'test-folder-999',
          };

          const newPayload: any = Object.assign({}, payload);
          Object.assign(newPayload, propEntry);

          const fail = await client
            .post('/tenant/' + t.code + '/items')
            .set('Content-Type', 'application/json')
            .set(principal.authHeaderName, principal.authHeaderValue)
            .send(newPayload)
            .expect('Content-Type', /application\/json/);

          expect(fail.status).to.equalOneOf(422, 400);
          expect(fail.body.error).to.not.be.undefined();

          // create with all properties then delete
          const res = await client
            .post('/tenant/' + t.code + '/items')
            .set('Content-Type', 'application/json')
            .set(principal.authHeaderName, principal.authHeaderValue)
            .send(payload)
            .expect(201);

          await client
            .del('/tenant/' + t.code + '/items/' + res.body.uuid)
            .set('Content-Type', 'application/json')
            .set(principal.authHeaderName, principal.authHeaderValue)
            .send(payload)
            .expect(204);
        },
      );
    });

    it(
      tenantConfig.name +
        ' - should not allow another folder in root with same name',
      async () => {
        const t = findTenant(tenantConfig);
        const payload = {
          type: 'FOLDER',
          name: 'test-folder-000',
        };

        await client
          .post('/tenant/' + t.code + '/items')
          .set('Content-Type', 'application/json')
          .set(principal.authHeaderName, principal.authHeaderValue)
          .send(payload)
          .expect('Content-Type', /application\/json/)
          .expect(409);
      },
    );

    it(
      tenantConfig.name + ' - should not allow a file in root with same name',
      async () => {
        const t = findTenant(tenantConfig);
        const payload = {
          type: 'FILE',
          name: 'test-folder-000',
        };

        await client
          .post('/tenant/' + t.code + '/items')
          .set('Content-Type', 'application/json')
          .set(principal.authHeaderName, principal.authHeaderValue)
          .send(payload)
          .expect('Content-Type', /application\/json/)
          .expect(409);
      },
    );

    it(
      tenantConfig.name + ' - should create another folder in root',
      async () => {
        const t = findTenant(tenantConfig);
        const payload = {
          type: 'FOLDER',
          name: 'test-folder-001',
          metadata: [
            {
              key: 'scenarioName',
              value: 'basic CRUD',
            },
          ],
        };

        await client
          .post('/tenant/' + t.code + '/items')
          .set('Content-Type', 'application/json')
          .set(principal.authHeaderName, principal.authHeaderValue)
          .send(payload)
          .expect('Content-Type', /application\/json/)
          .expect(201);
      },
    );

    it(tenantConfig.name + ' - should create a file in root', async () => {
      const t = findTenant(tenantConfig);
      const payload = {
        type: 'FILE',
        name: 'test-file-000.txt',
        metadata: [
          {
            key: 'scenarioName',
            value: 'basic CRUD',
          },
        ],
      };

      const res = await client
        .post('/tenant/' + t.code + '/items')
        .set('Content-Type', 'application/json')
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send(payload)
        .expect('Content-Type', /application\/json/)
        .expect(201);

      const response = res.body as CreateNodeResponse;

      // should have uuid
      expect(response.name).to.equal(payload.name);
      expect(response.type).to.equal(payload.type);
      expect(response.metadata[0].key).to.equal(payload.metadata[0].key);
      expect(response.metadata[0].value).to.equal(payload.metadata[0].value);
      expect(response.uuid.length).to.be.greaterThan(5);
      expect(response.audit.version).to.equal(1);
      expect(response.audit.createdBy).to.equal(principal.profile.code);
      expect(
        new Date(response.audit.createdAt).getTime(),
      ).to.be.lessThanOrEqual(new Date().getTime());
      expect(response.audit.modifiedAt).to.be.undefined();
      expect(response.audit.modifiedBy).to.be.undefined();
      expect(response.content).to.be.undefined();
      expect(response.audit.version).to.equal(1);

      // should hide private properties
      expect(response).to.not.have.property('id');
    });

    it(
      tenantConfig.name +
        ' - should not allow another file in root with same name',
      async () => {
        const t = findTenant(tenantConfig);
        const payload = {
          type: 'FILE',
          name: 'test-file-000.txt',
        };

        await client
          .post('/tenant/' + t.code + '/items')
          .set('Content-Type', 'application/json')
          .set(principal.authHeaderName, principal.authHeaderValue)
          .send(payload)
          .expect('Content-Type', /application\/json/)
          .expect(409);
      },
    );

    it(
      tenantConfig.name +
        ' - should not allow a folder in root with same name as file',
      async () => {
        const t = findTenant(tenantConfig);
        const payload = {
          type: 'FOLDER',
          name: 'test-file-000.txt',
        };

        await client
          .post('/tenant/' + t.code + '/items')
          .set('Content-Type', 'application/json')
          .set(principal.authHeaderName, principal.authHeaderValue)
          .send(payload)
          .expect('Content-Type', /application\/json/)
          .expect(409);
      },
    );

    it(
      tenantConfig.name + ' - should create another file in root',
      async () => {
        const t = findTenant(tenantConfig);
        const payload = {
          type: 'FILE',
          name: 'test-file-001.txt',
          metadata: [
            {
              key: 'scenarioName',
              value: 'basic CRUD',
            },
          ],
        };

        await client
          .post('/tenant/' + t.code + '/items')
          .set('Content-Type', 'application/json')
          .set(principal.authHeaderName, principal.authHeaderValue)
          .send(payload)
          .expect('Content-Type', /application\/json/)
          .expect(201);
      },
    );

    it(tenantConfig.name + ' - should have four nodes in root', async () => {
      const t = findTenant(tenantConfig);
      const res = await listRootNodes(t).expect(200);
      const response = res.body as ListNodesResponse;

      expect(response.content.length).to.equal(4);

      expect(
        response.content.map(o => {
          return {
            type: o.type,
            name: o.name,
          };
        }),
      )
        .to.containEql({
          type: StorageNodeType.FILE,
          name: 'test-file-000.txt',
        })
        .to.containEql({
          type: StorageNodeType.FILE,
          name: 'test-file-001.txt',
        })
        .to.containEql({
          type: StorageNodeType.FOLDER,
          name: 'test-folder-000',
        })
        .to.containEql({
          type: StorageNodeType.FOLDER,
          name: 'test-folder-001',
        });

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
        expect(entry.audit).to.not.have.property('id');
      });
    });

    it(
      tenantConfig.name + ' - should return elements in root by uuid',
      async () => {
        const t = findTenant(tenantConfig);
        const allNodes = (
          (await listRootNodes(t).expect(200)).body as ListNodesResponse
        ).content;

        // find test file 000
        const file000 = allNodes.find(n => n.name === 'test-file-000.txt');
        expect(file000).to.not.be.undefined();

        // find all by uuid
        for (const node of allNodes) {
          const res = await client
            .get(`/tenant/${t.code}/items/${node.uuid}`)
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect('Content-Type', /application\/json/)
            .expect(200);

          const entry = res.body as GetNodeResponse;

          expect(entry.name.length).to.be.greaterThan(0);
          expect(entry.type.length).to.be.greaterThan(2);
          expect(entry.uuid.length).to.be.greaterThan(5);
          expect(entry.audit.version).to.equal(1);
          expect(entry.audit.createdBy).to.equal(principal.profile.code);
          expect(
            new Date(entry.audit.createdAt).getTime(),
          ).to.be.lessThanOrEqual(new Date().getTime());
          expect(entry.audit.modifiedAt).to.be.undefined();
          expect(entry.audit.modifiedBy).to.be.undefined();
          expect(entry.audit.version).to.equal(1);

          // should have detail properties
          expect(entry.metadata.length).to.be.greaterThan(0);

          // should hide private properties
          expect(entry).to.not.have.property('id');
          expect(entry.audit).to.not.have.property('id');

          // should still have no content
          expect(entry).to.not.have.property('content');
        }
      },
    );

    it(
      tenantConfig.name + ' - should create content on root file',
      async () => {
        const t = findTenant(tenantConfig);
        const allNodes = (
          (await listRootNodes(t).expect(200)).body as ListNodesResponse
        ).content;
        const rootNode = allNodes.find(n => n.type === StorageNodeType.FILE)!;
        expect(rootNode).to.not.be.undefined();

        const payload = defaultPayload;

        // create content
        const res = await client
          .post(`/tenant/${t.code}/items/${rootNode.uuid}/content`)
          .set(principal.authHeaderName, principal.authHeaderValue)
          .attach(payload.field, payload.content, payload.options)
          .expect('Content-Type', /application\/json/);
        expect(res.status).to.equal(201);
        const response = res.body as CreateContentResponse;

        // should have uuid
        expect(response.key).to.equal(Constants.CONTENT.DEFAULT_KEY);
        expect(response.originalName).to.equal(payload.options.filename);
        expect(response.contentSize).to.equal(payload.content.length);
        expect(response).to.not.have.property('uuid');
        expect(response).to.have.property('encoding');
        expect(response).to.have.property('mimeType');
        expect(response.mimeType).to.equal(payload.options.contentType);

        // check audit
        expect(response.audit.version).to.equal(1);
        expect(response.audit.createdBy).to.equal(principal.profile.code);
        expect(
          new Date(response.audit.createdAt).getTime(),
        ).to.be.lessThanOrEqual(new Date().getTime());
        expect(response.audit.modifiedAt).to.be.undefined();
        expect(response.audit.modifiedBy).to.be.undefined();
        expect(response.audit.version).to.equal(1);

        // should hide private properties
        expect(response).to.not.have.property('id');
        expect(response).to.not.have.property('version');
      },
    );
  }
});
