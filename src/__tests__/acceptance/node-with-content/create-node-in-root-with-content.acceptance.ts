/* eslint-disable @typescript-eslint/no-explicit-any */
import {Client, expect} from '@loopback/testlab';
import {v4 as uuidv4} from 'uuid';
import {StorageGatewayApplication} from '../../../application';
import {
  ClientTenant,
  ClientTenantBackbone,
  StorageNodeType,
  supportedHashesList,
} from '../../../models';
import {CreateNodeResponse} from '../../../rest';
import {Constants} from '../../../utils';
import {
  getResourceWithMetadata,
  givenInMemoryTenants,
  givenMixedTenantConfigurations,
  TestResourceWithMetadata,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {
  getMetricService,
  setupApplication,
  tenantConfigurationsUnderTest,
} from '../../helper/test-helper';

describe('Create node in root with content', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let mixedTenants: ClientTenant[];

  const findTenant = (config: Partial<ClientTenant>) => {
    const tenant = mixedTenants.find(c => c.id === config.id);
    if (!tenant) {
      throw new Error('could not find test tenant of id ' + config.id);
    }
    return tenant;
  };

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

  const contentUrl = (tenant: ClientTenant | string, uuid: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid +
    '/content';

  const assetUrl = (
    tenant: ClientTenant | string,
    uuid: string,
    assetKey: string,
  ) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid +
    '/assets/' +
    assetKey;

  const fetchContent = async (tenant: ClientTenant | string, uuid: string) => {
    const res = await client
      .get(contentUrl(tenant, uuid))
      .redirects(2)
      .set(principal.authHeaderName, principal.authHeaderValue);

    expect(res.status).to.equal(200);
    if (res.status === 302) {
      const otherUrl = res.headers['location'];
      return client
        .get(otherUrl)
        .set(
          'User-Agent',
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36',
        )
        .expect(200);
    }
    return res;
  };

  const fetchContentAsset = async (
    tenant: ClientTenant | string,
    uuid: string,
    assetKey: string,
  ) =>
    client
      .get(assetUrl(tenant, uuid, assetKey))
      .set(principal.authHeaderName, principal.authHeaderValue)
      .expect(200);

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
      tenantConfig.name +
        ' - should return 401 when called without authentication',
      async () => {
        const defaultTenant = findTenant(tenantConfig);
        const payload = await payloadBuilder();
        await client
          .post(uploadUrl(defaultTenant))
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
          .expect('Content-Type', /application\/json/)
          .expect(401);
      },
    );

    it(
      tenantConfig.name +
        ' - should return 403 when called with bad credentials',
      async () => {
        const defaultTenant = findTenant(tenantConfig);
        const payload = await payloadBuilder();
        await client
          .post(uploadUrl(defaultTenant))
          .set(principal.authHeaderName, principal.wrongAuthHeaderValue)
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
          .expect('Content-Type', /application\/json/)
          .expect(401);
      },
    );

    it(
      tenantConfig.name +
        ' - should return 403 when called on a not-owned tenant',
      async () => {
        const otherTenants = await givenInMemoryTenants(app, 'otherOwner');

        const payload = await payloadBuilder();
        await client
          .post(uploadUrl(otherTenants[0]))
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
          .expect('Content-Type', /application\/json/)
          .expect(403);
      },
    );

    it(
      tenantConfig.name +
        ' - should return 404 when called on a missing tenant',
      async () => {
        const payload = await payloadBuilder();
        await client
          .post(uploadUrl('MISSINGTENANT'))
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
          .expect('Content-Type', /application\/json/)
          .expect(404);
      },
    );

    it(
      tenantConfig.name + ' - should return 400 with bad input data',
      async () => {
        const defaultTenant = findTenant(tenantConfig);
        const payload = await payloadBuilder();

        const entries = [
          {fileName: null, nodeName: null},
          {fileName: ' ', nodeName: ''},
          {contentType: null},
          {contentType: '  '},
        ];
        for (const propEntry of entries) {
          const newPayload: any = Object.assign({}, payload.data);
          Object.assign(newPayload, propEntry);
          const newOptions: any = Object.assign({}, payload.attachmentOptions);
          Object.assign(newOptions, propEntry);

          const fail = await client
            .post(uploadUrl(defaultTenant))
            .set(principal.authHeaderName, principal.authHeaderValue)
            .attach(
              payload.attachmentField,
              payload.attachmentContent,
              newOptions,
            )
            .field('data', JSON.stringify(newPayload))
            .expect('Content-Type', /application\/json/);

          expect(fail.status).to.equalOneOf(422, 400);
          expect(fail.body.error).to.not.be.undefined();

          // create with all properties then delete
          const res = await client
            .post(uploadUrl(defaultTenant))
            .set(principal.authHeaderName, principal.authHeaderValue)
            .attach(
              payload.attachmentField,
              payload.attachmentContent,
              payload.attachmentOptions,
            )
            .field('data', JSON.stringify(payload.data))
            .expect(201);

          await client
            .del('/tenant/' + defaultTenant.code + '/items/' + res.body.uuid)
            .set('Content-Type', 'application/json')
            .set(principal.authHeaderName, principal.authHeaderValue)
            .send(payload)
            .expect(204);
        }
      },
    );

    it(
      tenantConfig.name +
        ' - should return 400 when called with bad tenant code',
      async () => {
        const defaultTenant = findTenant(tenantConfig);
        const payload = await payloadBuilder();
        const malformedCodes = [
          '\\..\\',
          'TENANT!',
          'tenànt',
          ' ' + defaultTenant.code,
        ];
        for (const code of malformedCodes) {
          await client
            .post(uploadUrl(code))
            .set(principal.authHeaderName, principal.authHeaderValue)
            .attach(
              payload.attachmentField,
              payload.attachmentContent,
              payload.attachmentOptions,
            )
            .field('data', JSON.stringify(payload.data))
            .expect('Content-Type', /application\/json/)
            .expect(400);
        }
      },
    );

    it(tenantConfig.name + ' - should return 201 OK', async () => {
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
        .expect('Content-Type', /application\/json/)
        .expect(201);
    });

    it(tenantConfig.name + ' - should create a file', async () => {
      const defaultTenant = findTenant(tenantConfig);
      const payload = await payloadBuilder();

      const metrics = await getMetricService(app);
      metrics.delta();

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
        .expect('Content-Type', /application\/json/)
        .expect(201);

      const response = res.body as CreateNodeResponse;

      // should have uuid
      expect(response.name).to.equal(payload.data.nodeName);
      expect(response.type).to.equal(StorageNodeType.FILE);
      expect(response.uuid.length).to.be.greaterThan(5);

      // check metadata
      expect(response.metadata[0].key).to.equal(payload.data.metadata![0].key);
      expect(response.metadata[0].value).to.equal(
        payload.data.metadata![0].value,
      );

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

      // test on content
      const responseContent = response.content!;

      expect(responseContent.key).to.equal(Constants.CONTENT.DEFAULT_KEY);
      expect(responseContent.originalName).to.equal(
        payload.data.fileName ?? payload.attachmentOptions.filename,
      );
      expect(responseContent.contentSize).to.equal(
        payload.attachmentContent.length,
      );
      expect(responseContent).to.not.have.property('uuid');
      expect(responseContent).to.have.property('encoding');
      expect(responseContent).to.have.property('mimeType');
      expect(responseContent.mimeType).to.equal(
        payload.data.contentType ?? payload.attachmentOptions.contentType,
      );

      // check audit
      expect(responseContent.audit.version).to.equal(1);
      expect(responseContent.audit.createdBy).to.equal(principal.profile.code);
      expect(
        new Date(responseContent.audit.createdAt).getTime(),
      ).to.be.lessThanOrEqual(new Date().getTime());
      expect(responseContent.audit.modifiedAt).to.be.undefined();
      expect(responseContent.audit.modifiedBy).to.be.undefined();
      expect(responseContent.audit.version).to.equal(1);

      // should hide private properties
      expect(responseContent).to.not.have.property('id');
      expect(responseContent).to.not.have.property('version');

      // check backbone calls metrics
      const delta = metrics.delta();
      if (defaultTenant.backboneType === ClientTenantBackbone.FILESYSTEM) {
        expect(delta.externalWriteWithDataNumber).to.eql(
          1 + (defaultTenant.enableThumbnails ? 1 : 0),
        );
      } else if (defaultTenant.backboneType === ClientTenantBackbone.ONEDRIVE) {
        expect(delta.externalWriteWithDataNumber).to.eql(
          1 +
            (defaultTenant.enableThumbnails && defaultTenant.encryptionAlgorithm
              ? 1
              : 0),
        );
      } else if (defaultTenant.backboneType === ClientTenantBackbone.S3) {
        expect(delta.externalWriteWithDataNumber).to.eql(
          1 + (defaultTenant.enableThumbnails ? 1 : 0),
        );
      }

      // check the created physical content
      const createdContent = await fetchContent(defaultTenant, response.uuid);

      expect(createdContent.status).to.equal(200);
      expect(createdContent.body).to.not.be.undefined();

      if (defaultTenant.backboneType !== ClientTenantBackbone.ONEDRIVE) {
        expect(createdContent.headers['content-type']).to.startWith(
          payload.attachmentOptions.contentType!,
        );

        expect(createdContent.headers['content-length']).to.equal(
          payload.attachmentContent.length + '',
        );

        expect(payload.attachmentContent.compare(createdContent.body)).to.equal(
          0,
        );
        expect(createdContent.body.compare(createdContent.body)).to.equal(0);
      } else {
        // https://stackoverflow.com/questions/26906007/onedrive-wrong-size-for-png-files
        expect(
          parseInt(createdContent.headers['content-length'], 10),
        ).to.be.greaterThanOrEqual(payload.attachmentContent.length);
      }

      // check the thumbnails
      expect(response.content?.metadata?.image).to.not.be.undefined();
      if (
        defaultTenant.enableThumbnails &&
        !(
          defaultTenant.backboneType === 'ONEDRIVE' &&
          !defaultTenant.encryptionAlgorithm
        )
      ) {
        expect(
          response.content?.metadata?.image?.thumbnails?.length,
        ).to.be.greaterThan(0);
        const firstThumbnail =
          response.content!.metadata!.image!.thumbnails![0];

        // it should fetch the thumbnail
        const fetchedThumbnail = await fetchContentAsset(
          defaultTenant,
          response.uuid,
          firstThumbnail.assetKey,
        );
        expect(fetchedThumbnail.status).to.equal(200);
        expect(fetchedThumbnail.body).to.not.be.undefined();
        expect(fetchedThumbnail.headers['content-type']).to.startWith('image/');
        expect(
          fetchedThumbnail.headers['content-length'],
        ).to.not.be.undefined();
      } else if (!defaultTenant.enableThumbnails) {
        expect(
          response.content?.metadata?.image?.thumbnails?.length ?? 0,
        ).to.eql(0);
      }

      // check encryption
      if (defaultTenant.encryptionAlgorithm) {
        expect(response.content?.encryption?.algorithm).to.eql(
          defaultTenant.encryptionAlgorithm,
        );
        expect(Object.keys(response.content!.encryption!).length).to.eql(1);
        expect(response.content!.encryption).to.not.have.property('key');
        expect(response.content!.encryption).to.not.have.property('iv');
        expect(response.content!.encryption).to.not.have.property('auth');
      } else {
        expect(response.content!.encryption?.algorithm).to.be.undefined();
      }

      // check default checksum
      expect(response.content?.metadata?.hashes?.sha1).to.not.be.undefined();
      expect(response.content?.metadata?.hashes?.sha1).to.equal(
        payload.resource.metadata.sha1,
      );
    });

    for (const csType of supportedHashesList) {
      it(
        tenantConfig.name +
          ' - should compute the ' +
          csType +
          ' checksum when a control one is passed',
        async function () {
          let payload = await payloadBuilder();
          const t = findTenant(tenantConfig);

          const testResource = payload.resource;
          expect(testResource.metadata[csType]).to.not.be.undefined();
          const wrongHash = testResource.metadata[csType] + '000';

          // call with wrong hash
          let res = await client
            .post(uploadUrl(t))
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
                [csType]: wrongHash,
              }),
            )
            .expect('Content-Type', /application\/json/);

          // response should be 400
          expect(res.status).to.eql(400);

          let response = res.body;
          expect(response.error?.message).to.not.be.undefined();

          // error response details should contain the expected hash and the provided hash
          expect(response.error.message as string).to.match(
            new RegExp('.*' + testResource.metadata[csType] + '.*'),
          );
          expect(response.error.message as string).to.match(
            new RegExp('.*' + wrongHash + '.*'),
          );
          expect(response.error.message as string).to.match(
            new RegExp('.*' + csType + '.*'),
          );

          // call with correct hash
          payload = await payloadBuilder();
          const correctHash = testResource.metadata[csType] + '';
          res = await client
            .post(uploadUrl(t))
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
                [csType]: correctHash,
              }),
            )
            .expect('Content-Type', /application\/json/);

          // response should be 201
          expect(res.status).to.eql(201);
          response = res.body as CreateNodeResponse;

          expect(response.content?.metadata?.hashes).to.not.be.undefined();
          expect(
            response.content?.metadata?.hashes![csType],
          ).to.not.be.undefined();
          expect(response.content?.metadata?.hashes![csType]).to.equal(
            testResource.metadata[csType],
          );

          // it should always compute sha1 hash
          expect(
            response.content?.metadata?.hashes?.sha1,
          ).to.not.be.undefined();
          expect(response.content?.metadata?.hashes?.sha1).to.equal(
            testResource.metadata.sha1,
          );
        },
      );
    }

    it(
      tenantConfig.name +
        ' - should create a file then conflict when called again with the same name',
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
          .expect('Content-Type', /application\/json/)
          .expect(409);

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
          .expect('Content-Type', /application\/json/)
          .expect(409);
      },
    );

    it(
      tenantConfig.name + ' - should compute and return the ETag',
      async () => {
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
          .expect('Content-Type', /application\/json/)
          .expect(201);

        const response = res.body as CreateNodeResponse;
        expect(response.content?.metadata?.contentETag).to.not.be.undefined();

        const fetchedContent1 = await fetchContent(
          defaultTenant,
          response.uuid,
        );
        const fetchedContent2 = await fetchContent(
          defaultTenant,
          response.uuid,
        );

        if (tenantConfig.backboneType !== 'ONEDRIVE') {
          expect(response.content?.metadata?.contentETag).to.equal(
            fetchedContent1.headers['etag'],
          );
          expect(fetchedContent1.headers['etag']).to.equal(
            fetchedContent2.headers['etag'],
          );
        }

        expect(fetchedContent1.status).to.equal(200);
        expect(fetchedContent1.body).to.not.be.undefined();
        expect(fetchedContent2.status).to.equal(200);
        expect(fetchedContent2.body).to.not.be.undefined();
        expect(fetchedContent1.headers['etag']).to.not.be.undefined();
        expect(fetchedContent2.headers['etag']).to.not.be.undefined();
      },
    );
  }
});
