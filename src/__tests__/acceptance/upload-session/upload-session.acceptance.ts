/* eslint-disable @typescript-eslint/no-invalid-this */
import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {ClientTenant, StorageNode, StorageNodeType} from '../../../models';
import {
  CreateContentResponse,
  CreateUploadSessionHashesRequest,
  CreateUploadSessionRequest,
  CreateUploadSessionResponse,
} from '../../../rest';
import {Constants, ObjectUtils} from '../../../utils';
import {
  getResourceMetadata,
  getResourceWithMetadata,
  givenInMemoryTenants,
  givenMixedTenantConfigurations,
  givenSomeNodes,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {
  enableIntegrationTests,
  setupApplication,
  tenantConfigurationsUnderTest,
} from '../../helper/test-helper';

if (enableIntegrationTests()) {
  describe('Upload session', function () {
    // NOSONAR
    let app: StorageGatewayApplication;
    let client: Client;
    let principal: TestPrincipal;
    let mixedTenants: ClientTenant[];
    let otherTenants: ClientTenant[];
    let otherNodes: StorageNode[];
    const rootNodes: {[key: string]: StorageNode[]} = {};
    const defaultNode: {[key: string]: StorageNode} = {};

    const key = (tenant: ClientTenant) => {
      return ObjectUtils.require(tenant, 'id');
    };

    const createUploadSession = (
      tenant: ClientTenant | string,
      uuid: string,
      payload: CreateUploadSessionRequest,
    ) => {
      return client
        .post(
          `/tenant/${
            typeof tenant === 'string' ? tenant : tenant.code
          }/items/${uuid}/upload-session`,
        )
        .set(principal.authHeaderName, principal.authHeaderValue)
        .send(payload);
    };

    const uploadPart = (uuid: string) => {
      return client
        .post(`/upload-sessions/${uuid}/part`)
        .set(principal.authHeaderName, principal.authHeaderValue);
    };

    const finalizeUploadSession = (uuid: string) => {
      return client
        .post(`/upload-sessions/${uuid}/finalize`)
        .set(principal.authHeaderName, principal.authHeaderValue);
    };

    const getDefaultUploadSessionPayload = async (
      transformer?: (
        i: CreateUploadSessionRequest,
      ) => CreateUploadSessionRequest | void,
    ) => {
      const resourceMetadata = await getResourceMetadata(
        'splitted/test-5mb.bin',
      );
      let payload: CreateUploadSessionRequest = new CreateUploadSessionRequest({
        contentSize: ObjectUtils.require(resourceMetadata, 'size'),
        encoding: '7bit',
        fileName: 'test-5mb.bin',
        hashes: new CreateUploadSessionHashesRequest({
          md5: ObjectUtils.require(resourceMetadata, 'md5'),
          sha1: ObjectUtils.require(resourceMetadata, 'sha1'),
          sha256: ObjectUtils.require(resourceMetadata, 'sha256'),
        }),
        mimeType: ObjectUtils.require(resourceMetadata, 'mimeType'),
      });
      if (transformer) {
        const tf = transformer(payload);
        if (tf) {
          payload = tf;
        }
      }
      return payload;
    };

    before('setupApplication', async () => {
      this.timeout(30000);
      ({app, client} = await setupApplication());
      principal = givenPrincipal();

      mixedTenants = await givenMixedTenantConfigurations(
        app,
        principal.profile,
      );
      // populate default tenant

      for (const t of mixedTenants) {
        const k = key(t);
        rootNodes[k] = await givenSomeNodes(app, t, 16);
        defaultNode[k] = rootNodes[k].find(
          o => o.type === StorageNodeType.FILE,
        )!;
        expect(defaultNode[k]).to.not.be.undefined();
      }

      otherTenants = await givenInMemoryTenants(app, 'otherOwner');
      otherNodes = await givenSomeNodes(app, otherTenants[0]);
      expect(otherNodes.length).to.be.greaterThan(0);
    });

    after(async function () {
      this.timeout(60000);
      // TODO CLEANUP
      await app.stop();
    });

    const findTenant = (config: Partial<ClientTenant>) => {
      const tenant = mixedTenants.find(c => c.id === config.id);
      if (!tenant) {
        throw new Error('could not find test tenant of id ' + config.id);
      }
      return tenant;
    };

    // ******************************************
    // FIRST, CREATE AN UPLOAD SESSION
    // ******************************************

    for (const tenantConfig of tenantConfigurationsUnderTest) {
      it(
        tenantConfig.name +
          ' - should return 401 when called without authentication',
        async () => {
          const t = findTenant(tenantConfig);
          await createUploadSession(
            t,
            defaultNode[key(t)].uuid,
            await getDefaultUploadSessionPayload(),
          )
            .set(principal.authHeaderName, '')
            .expect('Content-Type', /application\/json/)
            .expect(401);
        },
      );

      it(
        tenantConfig.name +
          ' - should return 403 when called on a not-owned tenant',
        async () => {
          const rootNode = otherNodes.find(
            o => o.type === StorageNodeType.FILE,
          )!;

          await createUploadSession(
            otherTenants[0],
            rootNode.uuid,
            await getDefaultUploadSessionPayload(),
          )
            .expect('Content-Type', /application\/json/)
            .expect(403);
        },
      );

      it(
        tenantConfig.name +
          ' - should return 404 when called on a missing tenant',
        async () => {
          const t = findTenant(tenantConfig);
          await createUploadSession(
            'MISSINGTENANT',
            defaultNode[key(t)].uuid,
            await getDefaultUploadSessionPayload(),
          )
            .expect('Content-Type', /application\/json/)
            .expect(404);
        },
      );

      it(
        tenantConfig.name + ' - should return 404 on missing node',
        async () => {
          const t = findTenant(tenantConfig);
          await createUploadSession(
            t,
            'MISSINGNODE',
            await getDefaultUploadSessionPayload(),
          )
            .expect('Content-Type', /application\/json/)
            .expect(404);
        },
      );

      it(
        tenantConfig.name + ' - should return 400 when called on FOLDER',
        async () => {
          const t = findTenant(tenantConfig);
          const target = rootNodes[key(t)].find(
            o => o.type === StorageNodeType.FOLDER,
          )!;
          expect(target).to.not.be.undefined();

          await createUploadSession(
            t,
            target.uuid,
            await getDefaultUploadSessionPayload(),
          )
            .expect('Content-Type', /application\/json/)
            .expect(400);
        },
      );

      it(
        tenantConfig.name +
          ' - should return 400 when called with bad tenant code',
        async () => {
          const t = findTenant(tenantConfig);
          const malformedCodes = ['\\..\\', 'TENANT!', 'tenànt', ' ' + t.code];
          for (const code of malformedCodes) {
            await createUploadSession(
              code,
              defaultNode[key(t)].uuid,
              await getDefaultUploadSessionPayload(),
            )
              .expect('Content-Type', /application\/json/)
              .expect(400);
          }
        },
      );

      it(
        tenantConfig.name + ' - should return 400 when called with bad uuid',
        async () => {
          const t = findTenant(tenantConfig);
          const malformedCodes = [
            '..',
            '\\..\\',
            'UUID!',
            'uùid',
            ' ' + defaultNode.uuid,
          ];
          for (const code of malformedCodes) {
            await createUploadSession(
              t,
              code,
              await getDefaultUploadSessionPayload(),
            )
              .expect('Content-Type', /application\/json/)
              .expect(400);
          }
        },
      );

      it(
        tenantConfig.name + ` - should return 400 with bad input data`,
        async () => {
          const t = findTenant(tenantConfig);

          const transformers: ((
            i: CreateUploadSessionRequest,
          ) => CreateUploadSessionRequest | void)[] = [
            r => {
              r.fileName = null as unknown as string;
            },
            r => {
              r.fileName = ' ';
            },
          ];
          for (const transformer of transformers) {
            const newPayload = await getDefaultUploadSessionPayload(
              transformer,
            );

            const fail = await createUploadSession(
              t,
              defaultNode[key(t)].uuid,
              newPayload,
            ).expect('Content-Type', /application\/json/);

            expect(fail.status).to.equalOneOf(422, 400);
            expect(fail.body.error).to.not.be.undefined();
          }
        },
      );

      it(tenantConfig.name + ' - should return 200 OK', async function () {
        const t = findTenant(tenantConfig);
        const target = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[0];

        const res = await createUploadSession(
          t,
          target.uuid,
          await getDefaultUploadSessionPayload(),
        )
          .expect('Content-Type', /application\/json/)
          .expect(201);

        const responseEntity = res.body as CreateUploadSessionResponse;
        expect(responseEntity.uuid).to.not.be.undefined();
      });

      // ******************************************
      // NOW UPLOAD PARTS
      // ******************************************

      it(tenantConfig.name + ' - should work', async function () {
        const t = findTenant(tenantConfig);
        const target = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[0];

        const createUploadSessionPayload =
          await getDefaultUploadSessionPayload();

        // create the upload session
        const res = await createUploadSession(
          t,
          target.uuid,
          createUploadSessionPayload,
        )
          .expect('Content-Type', /application\/json/)
          .expect(201);

        // expect an UUID to be returned
        const responseEntity = res.body as CreateUploadSessionResponse;
        expect(responseEntity.uuid).to.not.be.undefined();

        // upload a part
        const part1Resource = await getResourceWithMetadata('splitted/part1');
        const part1UploadMetadata = {
          partNumber: 1,
          md5: ObjectUtils.require(part1Resource.metadata, 'md5'),
          sha1: ObjectUtils.require(part1Resource.metadata, 'sha1'),
          sha256: ObjectUtils.require(part1Resource.metadata, 'sha256'),
        };
        const part2Resource = await getResourceWithMetadata('splitted/part2');
        const part2UploadMetadata = {
          partNumber: 2,
          md5: ObjectUtils.require(part2Resource.metadata, 'md5'),
          sha1: ObjectUtils.require(part2Resource.metadata, 'sha1'),
          sha256: ObjectUtils.require(part2Resource.metadata, 'sha256'),
        };
        const part3Resource = await getResourceWithMetadata('splitted/part3');
        const part3UploadMetadata = {
          partNumber: 3,
          md5: ObjectUtils.require(part3Resource.metadata, 'md5'),
          sha1: ObjectUtils.require(part3Resource.metadata, 'sha1'),
          sha256: ObjectUtils.require(part3Resource.metadata, 'sha256'),
        };

        const part1UploadResponse = await uploadPart(responseEntity.uuid)
          .attach('file', part1Resource.content, {
            contentType: part1Resource.metadata.mimeType,
            filename: part1Resource.metadata.fileName,
          })
          .field('data', JSON.stringify(part1UploadMetadata));

        //console.log(part1UploadResponse.body);
        expect(part1UploadResponse.status).to.eql(204);
        // reupload same part
        await uploadPart(responseEntity.uuid)
          .attach('file', part1Resource.content, {
            contentType: part1Resource.metadata.mimeType,
            filename: part1Resource.metadata.fileName,
          })
          .field('data', JSON.stringify(part1UploadMetadata))
          .expect(204);

        // upload part 3
        await uploadPart(responseEntity.uuid)
          .attach('file', part3Resource.content, {
            contentType: part3Resource.metadata.mimeType,
            filename: part3Resource.metadata.fileName,
          })
          .field('data', JSON.stringify(part3UploadMetadata))
          .expect(204);

        // upload part 2
        await uploadPart(responseEntity.uuid)
          .attach('file', part2Resource.content, {
            contentType: part2Resource.metadata.mimeType,
            filename: part2Resource.metadata.fileName,
          })
          .field('data', JSON.stringify(part2UploadMetadata))
          .expect(204);

        // finalize the upload
        const finalizeRawResponse = await finalizeUploadSession(
          responseEntity.uuid,
        );

        //console.log(finalizeRawResponse.body);
        expect(finalizeRawResponse.status).to.eql(201);

        const finalizeResponseEntity =
          finalizeRawResponse.body as CreateContentResponse;

        expect(finalizeResponseEntity.key).to.eql(
          Constants.CONTENT.DEFAULT_KEY,
        );
      });

      it(tenantConfig.name + ' - should check part hashes', async function () {
        const t = findTenant(tenantConfig);
        const target = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[0];

        const createUploadSessionPayload =
          await getDefaultUploadSessionPayload();

        // create the upload session
        const res = await createUploadSession(
          t,
          target.uuid,
          createUploadSessionPayload,
        )
          .expect('Content-Type', /application\/json/)
          .expect(201);

        // expect an UUID to be returned
        const responseEntity = res.body as CreateUploadSessionResponse;
        expect(responseEntity.uuid).to.not.be.undefined();

        // upload a part
        const part1Resource = await getResourceWithMetadata('splitted/part1');
        const part1UploadMetadata = {
          partNumber: 1,
          md5: ObjectUtils.require(part1Resource.metadata, 'md5'),
          sha1: ObjectUtils.require(part1Resource.metadata, 'sha1'),
          sha256: ObjectUtils.require(part1Resource.metadata, 'sha256'),
        };

        const part1UploadResponse = await uploadPart(responseEntity.uuid)
          .attach('file', part1Resource.content, {
            contentType: part1Resource.metadata.mimeType,
            filename: part1Resource.metadata.fileName,
          })
          .field('data', JSON.stringify(part1UploadMetadata));

        //console.log(part1UploadResponse.body);
        expect(part1UploadResponse.status).to.eql(204);
        // reupload same part
        await uploadPart(responseEntity.uuid)
          .attach('file', part1Resource.content, {
            contentType: part1Resource.metadata.mimeType,
            filename: part1Resource.metadata.fileName,
          })
          .field('data', JSON.stringify(part1UploadMetadata))
          .expect(204);

        // reupload same part with wrong hash

        const wrongHashSha1Part1 =
          ObjectUtils.require(part1Resource.metadata, 'sha1') + 'aeef';
        const part1WrongHashUploadResponse = await uploadPart(
          responseEntity.uuid,
        )
          .attach('file', part1Resource.content, {
            contentType: part1Resource.metadata.mimeType,
            filename: part1Resource.metadata.fileName,
          })
          .field(
            'data',
            JSON.stringify({
              ...part1UploadMetadata,
              sha1: wrongHashSha1Part1,
            }),
          );

        // console.log(part1WrongHashUploadResponse.body);
        expect(part1WrongHashUploadResponse.status).to.eql(400);
        expect(
          part1WrongHashUploadResponse.body.error.message.includes('sha1'),
        ).to.be.true();
        expect(
          part1WrongHashUploadResponse.body.error.message.includes(
            wrongHashSha1Part1,
          ),
        ).to.be.true();
        expect(
          part1WrongHashUploadResponse.body.error.message.includes(
            ObjectUtils.require(part1Resource.metadata, 'sha1'),
          ),
        ).to.be.true();
      });

      it(
        tenantConfig.name + " - should reject finalization if size don't match",
        async function () {
          const t = findTenant(tenantConfig);
          const target = rootNodes[key(t)].filter(
            o => o.type === StorageNodeType.FILE,
          )[0];

          const createUploadSessionPayload =
            await getDefaultUploadSessionPayload();

          // create the upload session
          const res = await createUploadSession(
            t,
            target.uuid,
            createUploadSessionPayload,
          )
            .expect('Content-Type', /application\/json/)
            .expect(201);

          // expect an UUID to be returned
          const responseEntity = res.body as CreateUploadSessionResponse;
          expect(responseEntity.uuid).to.not.be.undefined();

          // upload a part
          const part1Resource = await getResourceWithMetadata('splitted/part1');
          const part1UploadMetadata = {
            partNumber: 1,
            md5: ObjectUtils.require(part1Resource.metadata, 'md5'),
            sha1: ObjectUtils.require(part1Resource.metadata, 'sha1'),
            sha256: ObjectUtils.require(part1Resource.metadata, 'sha256'),
          };
          const part2Resource = await getResourceWithMetadata('splitted/part2');
          const part2UploadMetadata = {
            partNumber: 2,
            md5: ObjectUtils.require(part2Resource.metadata, 'md5'),
            sha1: ObjectUtils.require(part2Resource.metadata, 'sha1'),
            sha256: ObjectUtils.require(part2Resource.metadata, 'sha256'),
          };

          const part1UploadResponse = await uploadPart(responseEntity.uuid)
            .attach('file', part1Resource.content, {
              contentType: part1Resource.metadata.mimeType,
              filename: part1Resource.metadata.fileName,
            })
            .field('data', JSON.stringify(part1UploadMetadata));

          //console.log(part1UploadResponse.body);
          expect(part1UploadResponse.status).to.eql(204);
          // reupload same part
          await uploadPart(responseEntity.uuid)
            .attach('file', part1Resource.content, {
              contentType: part1Resource.metadata.mimeType,
              filename: part1Resource.metadata.fileName,
            })
            .field('data', JSON.stringify(part1UploadMetadata))
            .expect(204);

          // upload part 2
          await uploadPart(responseEntity.uuid)
            .attach('file', part2Resource.content, {
              contentType: part2Resource.metadata.mimeType,
              filename: part2Resource.metadata.fileName,
            })
            .field('data', JSON.stringify(part2UploadMetadata))
            .expect(204);

          // don't upload part 3

          // finalize the upload
          const finalizeRawResponse = await finalizeUploadSession(
            responseEntity.uuid,
          );

          //console.log(finalizeRawResponse.body);
          expect(finalizeRawResponse.status).to.eql(400);
          expect(
            finalizeRawResponse.body.error.message.includes(
              createUploadSessionPayload.contentSize + '',
            ),
          ).to.be.true();
          expect(
            finalizeRawResponse.body.error.message.includes(
              (part1Resource.metadata.size ?? 0) +
                (part2Resource.metadata.size ?? 0) +
                '',
            ),
          ).to.be.true();
        },
      );

      it(
        tenantConfig.name +
          " - should reject finalization if hashes don't match",
        async function () {
          const t = findTenant(tenantConfig);
          const target = rootNodes[key(t)].filter(
            o => o.type === StorageNodeType.FILE,
          )[0];

          const correctUploadSessionPayload =
            await getDefaultUploadSessionPayload();

          const createUploadSessionPayload = new CreateUploadSessionRequest({
            ...correctUploadSessionPayload,
          });
          createUploadSessionPayload.hashes!.sha256 =
            createUploadSessionPayload.hashes!.sha256 + 'aaee';

          // create the upload session
          const res = await createUploadSession(
            t,
            target.uuid,
            createUploadSessionPayload,
          )
            .expect('Content-Type', /application\/json/)
            .expect(201);

          // expect an UUID to be returned
          const responseEntity = res.body as CreateUploadSessionResponse;
          expect(responseEntity.uuid).to.not.be.undefined();

          // upload a part
          const part1Resource = await getResourceWithMetadata('splitted/part1');
          const part1UploadMetadata = {
            partNumber: 1,
            md5: ObjectUtils.require(part1Resource.metadata, 'md5'),
            sha1: ObjectUtils.require(part1Resource.metadata, 'sha1'),
            sha256: ObjectUtils.require(part1Resource.metadata, 'sha256'),
          };
          const part2Resource = await getResourceWithMetadata('splitted/part2');
          const part2UploadMetadata = {
            partNumber: 2,
            md5: ObjectUtils.require(part2Resource.metadata, 'md5'),
            sha1: ObjectUtils.require(part2Resource.metadata, 'sha1'),
            sha256: ObjectUtils.require(part2Resource.metadata, 'sha256'),
          };
          const part3Resource = await getResourceWithMetadata('splitted/part3');
          const part3UploadMetadata = {
            partNumber: 3,
            md5: ObjectUtils.require(part3Resource.metadata, 'md5'),
            sha1: ObjectUtils.require(part3Resource.metadata, 'sha1'),
            sha256: ObjectUtils.require(part3Resource.metadata, 'sha256'),
          };

          const part1UploadResponse = await uploadPart(responseEntity.uuid)
            .attach('file', part1Resource.content, {
              contentType: part1Resource.metadata.mimeType,
              filename: part1Resource.metadata.fileName,
            })
            .field('data', JSON.stringify(part1UploadMetadata));

          //console.log(part1UploadResponse.body);
          expect(part1UploadResponse.status).to.eql(204);
          // reupload same part
          await uploadPart(responseEntity.uuid)
            .attach('file', part1Resource.content, {
              contentType: part1Resource.metadata.mimeType,
              filename: part1Resource.metadata.fileName,
            })
            .field('data', JSON.stringify(part1UploadMetadata))
            .expect(204);

          // upload part 2
          await uploadPart(responseEntity.uuid)
            .attach('file', part2Resource.content, {
              contentType: part2Resource.metadata.mimeType,
              filename: part2Resource.metadata.fileName,
            })
            .field('data', JSON.stringify(part2UploadMetadata))
            .expect(204);

          // upload part 3
          await uploadPart(responseEntity.uuid)
            .attach('file', part3Resource.content, {
              contentType: part3Resource.metadata.mimeType,
              filename: part3Resource.metadata.fileName,
            })
            .field('data', JSON.stringify(part3UploadMetadata))
            .expect(204);

          // finalize the upload
          const finalizeRawResponse = await finalizeUploadSession(
            responseEntity.uuid,
          );

          //console.log(finalizeRawResponse.body);
          expect(finalizeRawResponse.status).to.eql(400);
          expect(
            finalizeRawResponse.body.error.message
              .toLowerCase()
              .includes('sha256'),
          ).to.be.true();
          expect(
            finalizeRawResponse.body.error.message.includes(
              createUploadSessionPayload.hashes?.sha256 + '',
            ),
          ).to.be.true();
          expect(
            finalizeRawResponse.body.error.message.includes(
              correctUploadSessionPayload.hashes?.sha256 + '',
            ),
          ).to.be.true();
        },
      );

      it(
        tenantConfig.name +
          ' - should reject finalization if part numbers are skipping a number',
        async function () {
          const t = findTenant(tenantConfig);
          const target = rootNodes[key(t)].filter(
            o => o.type === StorageNodeType.FILE,
          )[0];

          const correctUploadSessionPayload =
            await getDefaultUploadSessionPayload();

          const createUploadSessionPayload = new CreateUploadSessionRequest({
            ...correctUploadSessionPayload,
          });
          createUploadSessionPayload.hashes!.sha256 =
            createUploadSessionPayload.hashes!.sha256 + 'aaee';

          // create the upload session
          const res = await createUploadSession(
            t,
            target.uuid,
            createUploadSessionPayload,
          )
            .expect('Content-Type', /application\/json/)
            .expect(201);

          // expect an UUID to be returned
          const responseEntity = res.body as CreateUploadSessionResponse;
          expect(responseEntity.uuid).to.not.be.undefined();

          // upload a part
          const part1Resource = await getResourceWithMetadata('splitted/part1');
          const part1UploadMetadata = {
            partNumber: 1,
            md5: ObjectUtils.require(part1Resource.metadata, 'md5'),
            sha1: ObjectUtils.require(part1Resource.metadata, 'sha1'),
            sha256: ObjectUtils.require(part1Resource.metadata, 'sha256'),
          };
          const part2Resource = await getResourceWithMetadata('splitted/part2');
          const part2UploadMetadata = {
            partNumber: 2,
            md5: ObjectUtils.require(part2Resource.metadata, 'md5'),
            sha1: ObjectUtils.require(part2Resource.metadata, 'sha1'),
            sha256: ObjectUtils.require(part2Resource.metadata, 'sha256'),
          };
          const part3Resource = await getResourceWithMetadata('splitted/part3');
          const part3UploadMetadata = {
            partNumber: 4,
            md5: ObjectUtils.require(part3Resource.metadata, 'md5'),
            sha1: ObjectUtils.require(part3Resource.metadata, 'sha1'),
            sha256: ObjectUtils.require(part3Resource.metadata, 'sha256'),
          };

          const part1UploadResponse = await uploadPart(responseEntity.uuid)
            .attach('file', part1Resource.content, {
              contentType: part1Resource.metadata.mimeType,
              filename: part1Resource.metadata.fileName,
            })
            .field('data', JSON.stringify(part1UploadMetadata));

          //console.log(part1UploadResponse.body);
          expect(part1UploadResponse.status).to.eql(204);
          // reupload same part
          await uploadPart(responseEntity.uuid)
            .attach('file', part1Resource.content, {
              contentType: part1Resource.metadata.mimeType,
              filename: part1Resource.metadata.fileName,
            })
            .field('data', JSON.stringify(part1UploadMetadata))
            .expect(204);

          // upload part 2
          await uploadPart(responseEntity.uuid)
            .attach('file', part2Resource.content, {
              contentType: part2Resource.metadata.mimeType,
              filename: part2Resource.metadata.fileName,
            })
            .field('data', JSON.stringify(part2UploadMetadata))
            .expect(204);

          // upload part 3
          await uploadPart(responseEntity.uuid)
            .attach('file', part3Resource.content, {
              contentType: part3Resource.metadata.mimeType,
              filename: part3Resource.metadata.fileName,
            })
            .field('data', JSON.stringify(part3UploadMetadata))
            .expect(204);

          // finalize the upload
          const finalizeRawResponse = await finalizeUploadSession(
            responseEntity.uuid,
          );

          //console.log(finalizeRawResponse.body);
          expect(finalizeRawResponse.status).to.eql(400);
          expect(
            finalizeRawResponse.body.error.message.includes('2'),
          ).to.be.true();
          expect(
            finalizeRawResponse.body.error.message.includes('3'),
          ).to.be.true();
          expect(
            finalizeRawResponse.body.error.message.includes('4'),
          ).to.be.true();
        },
      );

      it(
        tenantConfig.name +
          " - should reject finalization if part numbers don't start from 0 or 1",
        async function () {
          const t = findTenant(tenantConfig);
          const target = rootNodes[key(t)].filter(
            o => o.type === StorageNodeType.FILE,
          )[0];

          const correctUploadSessionPayload =
            await getDefaultUploadSessionPayload();

          const createUploadSessionPayload = new CreateUploadSessionRequest({
            ...correctUploadSessionPayload,
          });
          createUploadSessionPayload.hashes!.sha256 =
            createUploadSessionPayload.hashes!.sha256 + 'aaee';

          // create the upload session
          const res = await createUploadSession(
            t,
            target.uuid,
            createUploadSessionPayload,
          )
            .expect('Content-Type', /application\/json/)
            .expect(201);

          // expect an UUID to be returned
          const responseEntity = res.body as CreateUploadSessionResponse;
          expect(responseEntity.uuid).to.not.be.undefined();

          // upload a part
          const part1Resource = await getResourceWithMetadata('splitted/part1');
          const part1UploadMetadata = {
            partNumber: 2,
            md5: ObjectUtils.require(part1Resource.metadata, 'md5'),
            sha1: ObjectUtils.require(part1Resource.metadata, 'sha1'),
            sha256: ObjectUtils.require(part1Resource.metadata, 'sha256'),
          };
          const part2Resource = await getResourceWithMetadata('splitted/part2');
          const part2UploadMetadata = {
            partNumber: 3,
            md5: ObjectUtils.require(part2Resource.metadata, 'md5'),
            sha1: ObjectUtils.require(part2Resource.metadata, 'sha1'),
            sha256: ObjectUtils.require(part2Resource.metadata, 'sha256'),
          };
          const part3Resource = await getResourceWithMetadata('splitted/part3');
          const part3UploadMetadata = {
            partNumber: 4,
            md5: ObjectUtils.require(part3Resource.metadata, 'md5'),
            sha1: ObjectUtils.require(part3Resource.metadata, 'sha1'),
            sha256: ObjectUtils.require(part3Resource.metadata, 'sha256'),
          };

          const part1UploadResponse = await uploadPart(responseEntity.uuid)
            .attach('file', part1Resource.content, {
              contentType: part1Resource.metadata.mimeType,
              filename: part1Resource.metadata.fileName,
            })
            .field('data', JSON.stringify(part1UploadMetadata));

          //console.log(part1UploadResponse.body);
          expect(part1UploadResponse.status).to.eql(204);
          // reupload same part
          await uploadPart(responseEntity.uuid)
            .attach('file', part1Resource.content, {
              contentType: part1Resource.metadata.mimeType,
              filename: part1Resource.metadata.fileName,
            })
            .field('data', JSON.stringify(part1UploadMetadata))
            .expect(204);

          // upload part 2
          await uploadPart(responseEntity.uuid)
            .attach('file', part2Resource.content, {
              contentType: part2Resource.metadata.mimeType,
              filename: part2Resource.metadata.fileName,
            })
            .field('data', JSON.stringify(part2UploadMetadata))
            .expect(204);

          // upload part 3
          await uploadPart(responseEntity.uuid)
            .attach('file', part3Resource.content, {
              contentType: part3Resource.metadata.mimeType,
              filename: part3Resource.metadata.fileName,
            })
            .field('data', JSON.stringify(part3UploadMetadata))
            .expect(204);

          // finalize the upload
          const finalizeRawResponse = await finalizeUploadSession(
            responseEntity.uuid,
          );

          //console.log(finalizeRawResponse.body);
          expect(finalizeRawResponse.status).to.eql(400);
          expect(
            finalizeRawResponse.body.error.message.includes('0'),
          ).to.be.true();
          expect(
            finalizeRawResponse.body.error.message.includes('1'),
          ).to.be.true();
        },
      );
    }
  });
}
