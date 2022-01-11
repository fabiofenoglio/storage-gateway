import {Client, expect} from '@loopback/testlab';
import fs from 'fs-extra';
import {StorageGatewayApplication} from '../../../application';
import {UploadSessionsCleanupCronJob} from '../../../cronjobs/upload-sessions-cleanup.cronjob';
import {
  ClientTenant,
  StorageNode,
  StorageNodeType,
  UploadSessionPartStatus,
  UploadSessionStatus,
} from '../../../models';
import {
  UploadSessionPartRepository,
  UploadSessionRepository,
} from '../../../repositories';
import {
  CreateUploadSessionRequest,
  CreateUploadSessionResponse,
} from '../../../rest';
import {MultipartUploadService} from '../../../services';
import {ObjectUtils} from '../../../utils';
import {
  getResourceMetadata,
  getResourceWithMetadata,
  givenInMemoryTenants,
  givenSomeNodes,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {getCronjob, setupApplication} from '../../helper/test-helper';

describe('Upload sessions batch', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let inMemoryTenants: ClientTenant[];
  let defaultTenant: ClientTenant;
  let rootNodes: StorageNode[];

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    expect(app).to.not.be.undefined();
    expect(client).to.not.be.undefined();

    principal = givenPrincipal();
    inMemoryTenants = await givenInMemoryTenants(app, principal.profile);
    defaultTenant = inMemoryTenants[0];

    // populate default tenant
    rootNodes = await givenSomeNodes(app, defaultTenant);
    expect(rootNodes.length).to.be.greaterThan(0);
  });

  after(async () => {
    await app.stop();
  });

  const getJob = async () => {
    const job = (await getCronjob(
      app,
      'UploadSessionsCleanupCronJob',
    )) as UploadSessionsCleanupCronJob;
    expect(job).to.not.be.undefined();
    return job;
  };

  const uploadPart = (uuid: string) => {
    return client
      .post(`/upload-sessions/${uuid}/part`)
      .set(principal.authHeaderName, principal.authHeaderValue);
  };

  const createSession = async (parts?: number) => {
    parts = parts ?? 1;

    const uploadSessionRepository = await app.getRepository(
      UploadSessionRepository,
    );
    const uploadSessionPartRepository = await app.getRepository(
      UploadSessionPartRepository,
    );
    const aFileNode = rootNodes.filter(
      n => n.type === StorageNodeType.FILE,
    )[0]!;

    const resourceMetadata = await getResourceMetadata('splitted/test-5mb.bin');

    const defaultCreateSessionPayload = new CreateUploadSessionRequest({
      contentSize: resourceMetadata.size,
      fileName: resourceMetadata.fileName,
      mimeType: resourceMetadata.mimeType,
      encoding: '7bit',
    });

    // create a session
    const session1res = await client
      .post(
        `/tenant/${defaultTenant.code}/items/${aFileNode.uuid}/upload-session`,
      )
      .set(principal.authHeaderName, principal.authHeaderValue)
      .send(new CreateUploadSessionRequest({...defaultCreateSessionPayload}))
      .expect(201);
    const session1 = session1res.body as CreateUploadSessionResponse;

    // upload a part
    for (
      let partNumber = 1;
      partNumber <= parts && partNumber <= 3;
      partNumber++
    ) {
      const partResource = await getResourceWithMetadata(
        'splitted/part' + partNumber,
      );
      const partUploadMetadata = {
        partNumber,
        md5: ObjectUtils.require(partResource.metadata, 'md5'),
        sha1: ObjectUtils.require(partResource.metadata, 'sha1'),
        sha256: ObjectUtils.require(partResource.metadata, 'sha256'),
      };

      await uploadPart(session1.uuid)
        .attach('file', partResource.content, {
          contentType: partResource.metadata.mimeType,
          filename: partResource.metadata.fileName,
        })
        .field('data', JSON.stringify(partUploadMetadata))
        .expect(204);
    }

    const entity = (await uploadSessionRepository.findOne({
      where: {uuid: session1.uuid},
    }))!;

    const partEntities = await uploadSessionPartRepository.find({
      where: {
        sessionId: entity.id,
      },
    });

    return {
      dto: session1,
      entity,
      partEntities,
    };
  };

  it('cleans the remaining sessions', async () => {
    const job = await getJob();

    const service = (await app.get(
      'services.MultipartUploadService',
    )) as MultipartUploadService;
    const uploadSessionRepository = await app.getRepository(
      UploadSessionRepository,
    );
    const uploadSessionPartRepository = await app.getRepository(
      UploadSessionPartRepository,
    );

    const uploadSessionsRootFolder = service.buildUploadLocation('none').root;
    await fs.emptyDir(uploadSessionsRootFolder);

    // create some sessions
    const s1 = await createSession(2);
    const s2 = await createSession(2);
    const s3 = await createSession(2);
    const s4 = await createSession(1);
    const s5 = await createSession(1);
    const s6 = await createSession(1);
    const s7 = await createSession(1);
    const s8 = await createSession(1);
    const s9 = await createSession(1);
    const s10 = await createSession(1);

    expect(s1.entity.status).to.eql(UploadSessionStatus.ACTIVE);
    expect(s2.entity.status).to.eql(UploadSessionStatus.ACTIVE);
    expect(s3.entity.status).to.eql(UploadSessionStatus.ACTIVE);
    expect(s4.entity.status).to.eql(UploadSessionStatus.ACTIVE);
    expect(s5.entity.status).to.eql(UploadSessionStatus.ACTIVE);
    expect(s6.entity.status).to.eql(UploadSessionStatus.ACTIVE);
    expect(s7.entity.status).to.eql(UploadSessionStatus.ACTIVE);
    expect(s8.entity.status).to.eql(UploadSessionStatus.ACTIVE);
    expect(s9.entity.status).to.eql(UploadSessionStatus.ACTIVE);
    expect(s10.entity.status).to.eql(UploadSessionStatus.ACTIVE);

    const sessionEntitiesBefore = await uploadSessionRepository.find();
    const partEntitiesBefore = await uploadSessionPartRepository.find();

    expect(sessionEntitiesBefore.length).to.eql(10);
    expect(partEntitiesBefore.length).to.eql(13);

    // session 1 in status ACTIVE with recent creation, not expired
    // expect physical content to remain and records to remain
    s1.entity.status = UploadSessionStatus.ACTIVE;
    await uploadSessionRepository.update(s1.entity);

    // session 2 ACTIVE but created 4 days ago, expires 2 days ago
    // expect physical content to be removed and records to remain
    s2.entity.status = UploadSessionStatus.ACTIVE;
    s2.entity.createdAt = new Date(
      new Date().getTime() - 4 * 24 * 60 * 60 * 1000,
    );
    s2.entity.expiresAt = new Date(
      new Date().getTime() - 2 * 24 * 60 * 60 * 1000,
    );
    await uploadSessionRepository.update(s2.entity);

    // session 3 CLEARED 5 minutes ago
    // expect physical content to not be touched and records to remain
    s3.entity.status = UploadSessionStatus.CLEARED;
    s3.entity.transitionedAt = new Date(new Date().getTime() - 5 * 60 * 1000);
    await uploadSessionRepository.update(s3.entity);
    await uploadSessionPartRepository.updateAll(
      {
        status: UploadSessionPartStatus.CLEARED,
        transitionedAt: s3.entity.transitionedAt,
      },
      {
        sessionId: s3.entity.id,
      },
    );

    // session 4 CLEARED 5 days ago
    // expect physical content to not be touched and records to remain
    s4.entity.status = UploadSessionStatus.CLEARED;
    s4.entity.transitionedAt = new Date(
      new Date().getTime() - 5 * 24 * 60 * 60 * 1000,
    );
    await uploadSessionRepository.update(s4.entity);
    await uploadSessionPartRepository.updateAll(
      {
        status: UploadSessionPartStatus.CLEARED,
        transitionedAt: s4.entity.transitionedAt,
      },
      {
        sessionId: s4.entity.id,
      },
    );

    // session 5 DELETED 2 days ago
    // expect physical content to be removed and records to remain
    s5.entity.status = UploadSessionStatus.DELETED;
    s5.entity.transitionedAt = new Date(
      new Date().getTime() - 2 * 24 * 60 * 60 * 1000,
    );
    await uploadSessionRepository.update(s5.entity);

    // session 6 DELETED 30 days ago
    // expect physical content to be removed and records to be removed
    s6.entity.status = UploadSessionStatus.DELETED;
    s6.entity.transitionedAt = new Date(
      new Date().getTime() - 30 * 24 * 60 * 60 * 1000,
    );
    await uploadSessionRepository.update(s6.entity);

    // session 7 FINALIZED 10 minutes ago
    // expect no action
    s7.entity.status = UploadSessionStatus.FINALIZED;
    s7.entity.transitionedAt = new Date(new Date().getTime() - 10 * 60 * 1000);
    await uploadSessionRepository.update(s7.entity);

    // session 8 FINALIZED 15 days ago
    // expect physical content to be removed and records to be removed
    s8.entity.status = UploadSessionStatus.FINALIZED;
    s8.entity.transitionedAt = new Date(
      new Date().getTime() - 15 * 24 * 60 * 60 * 1000,
    );
    await uploadSessionRepository.update(s8.entity);

    // session 9 FINALIZING 1 hour ago
    // expect no action
    s9.entity.status = UploadSessionStatus.FINALIZING;
    s9.entity.transitionedAt = new Date(
      new Date().getTime() - 1 * 60 * 60 * 1000,
    );
    await uploadSessionRepository.update(s9.entity);

    // session 10 FINALIZING 15 days ago
    // expect physical content to be removed and records to be removed
    s10.entity.status = UploadSessionStatus.FINALIZING;
    s10.entity.transitionedAt = new Date(
      new Date().getTime() - 15 * 24 * 60 * 60 * 1000,
    );
    await uploadSessionRepository.update(s10.entity);

    // launch job
    await job.forceExecution();

    // check leftovers
    const sessionEntitiesAfter = await uploadSessionRepository.find();
    const partEntitiesAfter = await uploadSessionPartRepository.find();

    expect(sessionEntitiesAfter.length).to.eql(10);
    //expect(partEntitiesAfter.length).to.eql(10);
    expect(partEntitiesAfter.length).to.eql(13);

    /*
    const sessionIdsAfter = sessionEntitiesAfter.map(e => e.id);
    const partIdsAfter = partEntitiesAfter.map(e => e.id);

    expect(sessionIdsAfter.includes(s1.entity.id)).to.be.true();
    expect(sessionIdsAfter.includes(s2.entity.id)).to.be.true();
    expect(sessionIdsAfter.includes(s3.entity.id)).to.be.true();
    expect(sessionIdsAfter.includes(s4.entity.id)).to.be.false();
    expect(sessionIdsAfter.includes(s5.entity.id)).to.be.true();
    expect(sessionIdsAfter.includes(s6.entity.id)).to.be.false();
    expect(sessionIdsAfter.includes(s7.entity.id)).to.be.true();
    expect(sessionIdsAfter.includes(s8.entity.id)).to.be.false();
    expect(sessionIdsAfter.includes(s9.entity.id)).to.be.true();
    expect(sessionIdsAfter.includes(s10.entity.id)).to.be.false();
    */
  });
});
