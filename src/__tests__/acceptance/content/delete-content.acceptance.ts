/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-invalid-this */
import {DefaultCrudRepository} from '@loopback/repository';
import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {CronJobWrapper} from '../../../cronjobs/wrapper.cronjob';
import {
  AbstractContent,
  ClientTenant,
  ClientTenantBackbone,
  ContentStatus,
  CronJobReportedMessageLevel,
  NodeStatus,
  StorageNode,
  StorageNodeType,
} from '../../../models';
import {StorageNodeRepository} from '../../../repositories';
import {GetNodeResponse} from '../../../rest';
import {AbstractContentManagerService} from '../../../services';
import {ObjectUtils} from '../../../utils';
import {
  givenInMemoryTenants,
  givenMixedTenantConfigurations,
  givenSomeContent,
  givenSomeNodes,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {
  getContentDeletionBatchBinding,
  getContentManagerBinding,
  getContentRepositoryBinding,
  setupApplication,
  tenantConfigurationsUnderTest,
} from '../../helper/test-helper';

describe('Delete content', function () {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let mixedTenants: ClientTenant[];
  const defaultContent: {
    [key: string]: {content: AbstractContent; payload: Buffer};
  } = {};
  const rootNodes: {[key: string]: StorageNode[]} = {};
  const defaultNode: {[key: string]: StorageNode} = {};

  const key = (tenant: ClientTenant) => {
    return ObjectUtils.require(tenant, 'id');
  };

  const findTenant = (config: Partial<ClientTenant>) => {
    const tenant = mixedTenants.find(c => c.id === config.id);
    if (!tenant) {
      throw new Error('could not find test tenant of id ' + config.id);
    }
    return tenant;
  };

  const url = (tenant: ClientTenant | string, uuid: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid +
    '/content';

  const nodeUrl = (tenant: ClientTenant | string, uuid: string) =>
    '/tenant/' +
    (typeof tenant === 'string' ? tenant : tenant.code) +
    '/items/' +
    uuid;

  const fetch = async (tenant: ClientTenant | string, uuid: string) =>
    (
      (
        await client
          .get(nodeUrl(tenant, uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect('Content-Type', /application\/json/)
          .expect(200)
      ).body as GetNodeResponse
    ).content;

  before('setupApplication', async function () {
    this.timeout(120 * 1000);
    ({app, client} = await setupApplication());
    principal = givenPrincipal();
    mixedTenants = await givenMixedTenantConfigurations(app, principal.profile);

    for (const t of mixedTenants) {
      const k = key(t);
      // populate default tenant
      rootNodes[k] = await givenSomeNodes(app, t, 10);
      expect(rootNodes[k].length).to.be.greaterThan(0);

      defaultNode[k] = rootNodes[k].find(o => o.type === StorageNodeType.FILE)!;
      expect(defaultNode[k]).to.not.be.undefined();

      defaultContent[k] = await givenSomeContent(app, t, defaultNode[k]);
      expect(defaultContent[k]).to.not.be.undefined();

      for (const rootFile of rootNodes[k].filter(
        o => o.type === StorageNodeType.FILE,
      )) {
        if (rootFile.id === defaultNode[k].id) {
          continue;
        }
        await givenSomeContent(app, t, rootFile);
      }
    }
  });

  after(async () => {
    await app.stop();
  });

  for (const tenantConfig of tenantConfigurationsUnderTest) {
    it(tenantConfig.name + ' - should return 204 No content', async () => {
      const t = findTenant(tenantConfig);
      await client
        .delete(url(t, defaultNode[key(t)].uuid))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect(204);
    });

    it(
      tenantConfig.name + ' - should return 401 without authorization',
      async () => {
        const t = findTenant(tenantConfig);
        await client
          .delete(url(t, defaultNode[key(t)].uuid))
          .expect('Content-Type', /application\/json/)
          .expect(401);
      },
    );

    it(
      tenantConfig.name + ' - should return 403 on not-owned tenants',
      async () => {
        const otherTenants = await givenInMemoryTenants(app, 'otherOwner');
        const otherNodes = await givenSomeNodes(app, otherTenants[0]);
        expect(otherNodes.length).to.be.greaterThan(0);
        const otherFile = otherNodes.find(
          o => o.type === StorageNodeType.FILE,
        )!;
        expect(otherFile).to.not.be.undefined();
        await givenSomeContent(app, otherTenants[0], otherFile);

        const res = await client
          .delete(url(otherTenants[0], otherFile.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect('Content-Type', /application\/json/);

        expect(res.status).to.equal(403);
      },
    );

    it(
      tenantConfig.name + ' - should return 404 on missing tenants',
      async () => {
        const t = findTenant(tenantConfig);
        await client
          .delete(url('MISSINGTENANT', defaultNode[key(t)].uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect('Content-Type', /application\/json/)
          .expect(404);
      },
    );

    it(tenantConfig.name + ' - should return 404 on missing uuid', async () => {
      const t = findTenant(tenantConfig);
      await client
        .delete(url(t, 'missinguuid'))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect('Content-Type', /application\/json/)
        .expect(404);
    });

    it(
      tenantConfig.name +
        ' - should return 400 when called with bad tenant code',
      async () => {
        const t = findTenant(tenantConfig);
        const malformedCodes = ['\\..\\', 'TENANT!', 'tenànt', ' ' + t.code];
        for (const code of malformedCodes) {
          await client
            .delete(url(code, defaultNode[key(t)].uuid))
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect('Content-Type', /application\/json/)
            .expect(400);
        }
      },
    );

    it(
      tenantConfig.name + ' - should return 400 when called with bad node uuid',
      async () => {
        const t = findTenant(tenantConfig);
        const malformedCodes = [
          '..',
          '\\..\\',
          'UUID!',
          'uùid',
          ' ' + rootNodes[key(t)][0].uuid,
        ];
        for (const code of malformedCodes) {
          await client
            .delete(url(t, code))
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect('Content-Type', /application\/json/)
            .expect(400);
        }
      },
    );

    it(
      tenantConfig.name +
        ' - should not allow to retrieve deleted elements with get by uuid',
      async () => {
        const t = findTenant(tenantConfig);
        const target = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[1];

        await client
          .get(url(t, target.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .redirects(2)
          .expect(200);

        await client
          .delete(url(t, target.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect(204);

        await client
          .get(url(t, target.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect(404);
      },
    );

    it(tenantConfig.name + ' - should not allow to delete again', async () => {
      const t = findTenant(tenantConfig);
      const target = rootNodes[key(t)].filter(
        o => o.type === StorageNodeType.FILE,
      )[2];
      await client
        .delete(url(t, target.uuid))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect(204);

      await client
        .delete(url(t, target.uuid))
        .set(principal.authHeaderName, principal.authHeaderValue)
        .expect(404);
    });

    it(
      tenantConfig.name +
        ' - should not return content from node GET after deletion',
      async () => {
        const t = findTenant(tenantConfig);
        const target = rootNodes[key(t)].filter(
          o => o.type === StorageNodeType.FILE,
        )[3];
        const contentBefore = await fetch(t, target.uuid);
        expect(contentBefore).to.not.be.undefined();
        expect(contentBefore?.originalName.length).to.be.greaterThan(0);

        await client
          .get(url(t, target.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .redirects(2)
          .expect(200);

        await client
          .delete(url(t, target.uuid))
          .set(principal.authHeaderName, principal.authHeaderValue)
          .expect(204);

        // should not return content
        const contentAfter = await fetch(t, target.uuid);
        expect(contentAfter).to.be.undefined();
      },
    );

    if (tenantConfig.backboneType !== 'MEMORY') {
      it(
        tenantConfig.name +
          ' - should delete the content record and the physical content with the job',
        async () => {
          const t = findTenant(tenantConfig);
          const target = rootNodes[key(t)].filter(
            o => o.type === StorageNodeType.FILE,
          )[4];
          const contentBefore = await fetch(t, target.uuid);
          expect(contentBefore).to.not.be.undefined();
          expect(contentBefore?.originalName.length).to.be.greaterThan(0);

          const storageNodeRepository = await app.getRepository(
            StorageNodeRepository,
          );
          const contentRepository = (await app.getRepository(
            getContentRepositoryBinding(
              tenantConfig.backboneType as ClientTenantBackbone,
            ),
          )) as DefaultCrudRepository<AbstractContent, number, any>;

          const record = await storageNodeRepository.findOne({
            where: {
              uuid: target.uuid,
              status: {
                eq: NodeStatus.ACTIVE,
              },
            },
          });
          expect(record).to.not.be.undefined();
          expect(record?.uuid).to.eql(target.uuid);

          const contentRecord = await contentRepository.findOne({
            where: {
              status: ContentStatus.ACTIVE,
              nodeId: record!.id,
            },
          });
          expect(contentRecord).to.not.be.undefined();
          expect(contentRecord?.nodeUuid).to.eql(target.uuid);

          await client
            .delete(url(t, target.uuid))
            .set(principal.authHeaderName, principal.authHeaderValue)
            .expect(204);

          const contentManager = (await app.get(
            getContentManagerBinding(
              tenantConfig.backboneType as ClientTenantBackbone,
            ),
          )) as AbstractContentManagerService<AbstractContent>;

          // content now deleted logically
          const contentRecordAfterLogicDelete = await contentRepository.findOne(
            {
              where: {
                id: contentRecord!.id,
              },
            },
          );
          expect(contentRecordAfterLogicDelete).to.not.be.undefined();
          expect(contentRecordAfterLogicDelete?.nodeUuid).to.eql(target.uuid);
          expect(contentRecordAfterLogicDelete?.id).to.eql(contentRecord!.id);
          expect(contentRecordAfterLogicDelete?.status).to.eql(
            ContentStatus.DELETED,
          );

          // alter record deletion date to be much in the past
          contentRecordAfterLogicDelete.deletedAt = new Date(
            new Date().getTime() - 15 * 24 * 60 * 60 * 1000,
          );
          await contentRepository.update(contentRecordAfterLogicDelete);

          // record should appear in deletion candidates
          const deletionCandidates =
            await contentManager.getContentQueuedForDeletion({
              page: 0,
              size: 50,
            });
          const deletionCandidate = deletionCandidates.content.find(
            c => c.id === contentRecord?.id,
          );
          expect(deletionCandidate).to.not.be.undefined();

          // launch deletion job manually
          const job = (await app.get(
            getContentDeletionBatchBinding(
              tenantConfig.backboneType as ClientTenantBackbone,
            ),
          )) as CronJobWrapper;
          expect(job).to.not.be.undefined();
          const jobCtx = await job.forceExecution();
          expect(
            jobCtx.reportedMessages?.filter(
              m => m.level === CronJobReportedMessageLevel.ERROR,
            ).length ?? 0,
          ).to.eql(0);
          expect(
            jobCtx.reportedMessages?.filter(
              m => m.level === CronJobReportedMessageLevel.WARNING,
            ).length ?? 0,
          ).to.eql(0);

          // content record now deleted physically
          const contentRecordAfterJob = await contentRepository.findOne({
            where: {
              id: contentRecord!.id,
            },
          });
          expect(contentRecordAfterJob).to.be.null();
        },
      );
    }
  }
});
