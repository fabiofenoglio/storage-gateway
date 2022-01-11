/* eslint-disable @typescript-eslint/no-invalid-this */
import {Client, expect} from '@loopback/testlab';
import {v4 as uuidv4} from 'uuid';
import {StorageGatewayApplication} from '../../../application';
import {LockService} from '../../../services/lock.service';
import {setupApplication, sleep} from '../../helper/test-helper';

describe('Lock', () => {
  let app: StorageGatewayApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    expect(app).to.not.be.undefined();
    expect(client).to.not.be.undefined();
  });

  after(async () => {
    await app.stop();
  });

  const getService = async () => {
    const service: LockService = await app.get('services.LockService');
    expect(service).to.not.be.undefined();
    return service;
  };

  it('builds an instance of LockService', async () => {
    const service = await getService();
    expect(service).to.not.be.undefined();
  });

  it('acquires a lock', async () => {
    const service = await getService();

    const resourceCode = uuidv4();
    const ownerCode = uuidv4();

    const now = new Date();
    const lockResult = await service.acquire({
      resourceCode,
      ownerCode,
      duration: 10000,
    });

    expect(lockResult.acquired).to.be.true();
    expect(lockResult.lockedBySomeoneElse).to.not.be.true();
    expect(lockResult.renewed).to.not.be.true();
    expect(lockResult.lock).to.not.be.undefined();
    expect(lockResult.lock!.resourceCode).to.eql(resourceCode);
    expect(lockResult.lock!.ownerCode).to.eql(ownerCode);
    expect(lockResult.lock!.expiresAt).to.not.be.undefined();
    expect(lockResult.lock!.expiresAt.getTime()).to.be.greaterThan(
      now.getTime(),
    );

    // attempt on same resource with another owner code should not work
    const failedAttempt = await service.acquire({
      resourceCode,
      ownerCode: uuidv4(),
      duration: 1000,
    });

    expect(failedAttempt.acquired).to.be.false();
    expect(failedAttempt.lock).to.be.undefined();
    expect(failedAttempt.lockedBySomeoneElse).to.be.true();
    expect(failedAttempt.reason).to.not.be.undefined();

    expect(
      await service.release({resourceCode, ownerCode: uuidv4()}),
    ).to.be.false();

    // attempt on same resource with same code should return renewed
    const renewResult = await service.acquire({
      resourceCode,
      ownerCode,
      duration: 5000,
    });

    expect(renewResult.lock!.id).to.eql(lockResult.lock!.id);

    expect(renewResult.acquired).to.be.true();
    expect(renewResult.lockedBySomeoneElse).to.not.be.true();
    expect(renewResult.renewed).to.be.true();
    expect(renewResult.lock).to.not.be.undefined();
    expect(renewResult.lock!.resourceCode).to.eql(resourceCode);
    expect(renewResult.lock!.ownerCode).to.eql(ownerCode);
    expect(renewResult.lock!.expiresAt).to.not.be.undefined();
    expect(renewResult.lock!.expiresAt.getTime()).to.be.greaterThan(
      now.getTime(),
    );

    // release lock at end of test
    expect(await service.release(renewResult.lock!)).to.be.true();
    expect(await service.release(renewResult.lock!)).to.be.false();
  });

  it('handles concurrent executions locking resources', async function () {
    this.timeout(5000);
    const service = await getService();

    const resourceCode = 'concurrent-tasks';
    const ownerCode1 = 'owner-1';
    const ownerCode2 = 'owner-2';
    const ownerCode3 = 'owner-3';

    const out: number[] = [];

    const task1 = service.executeLocking(
      async () => {
        await sleep(600);
        out.push(101);
        await sleep(200);
        out.push(102);
        await sleep(200);
      },
      {
        resourceCode,
        ownerCode: ownerCode1,
        duration: 10000,
        timeout: 60000,
      },
    );

    await sleep(200);
    const task2 = service.executeLocking(
      async () => {
        await sleep(300);
        out.push(201);
        await sleep(200);
        out.push(202);
      },
      {
        resourceCode,
        ownerCode: ownerCode2,
        duration: 10000,
        timeout: 60000,
      },
    );

    await sleep(200);
    const task3 = service.executeLocking(
      async () => {
        out.push(301);
        await sleep(200);
        out.push(302);
      },
      {
        resourceCode,
        ownerCode: ownerCode3,
        duration: 10000,
        timeout: 60000,
      },
    );

    await Promise.all([task1, task2, task3]);

    expect(JSON.stringify(out)).to.equal(
      JSON.stringify([101, 102, 201, 202, 301, 302]),
    );
  });
});
