import {
  BindingScope,
  inject,
  injectable,
  service
} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {
  juggler,
  repository
} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import AsyncLock from 'async-lock';
import {v4 as uuidv4} from 'uuid';
import {LoggerBindings} from '../key';
import {ResourceLock} from '../models';
import {ResourceLockRepository} from '../repositories';
import {ObjectUtils} from '../utils';
import {TransactionService} from './transaction-manager.service';



export interface LockAcquisitionRequest {
  resourceCode: string;
  ownerCode?: string;
  duration: number;
  timeout?: number;
  retryEvery?: number;
}

export interface LockDeleteRequest {
  resourceCode: string;
  ownerCode: string;
}

export interface LockAcquisitionAttemptResult {
  acquired: boolean;
  lock?: ResourceLock;
  reason?: string;
  lockedBySomeoneElse?: boolean;
  renewed?: boolean;
  timedOut?: boolean;
  waitedFor?: number;
}

@injectable({scope: BindingScope.SINGLETON})
export class LockService {
  private delayBeforeAcquisition = 0;
  private delayBeforeRelease = 0;
  private delayBeforeReleaseFlush = 0;
  private delayBeforeAcquisitionFlush = 0;
  private synchronizeDatabaseRowOnRelease = false;

  private localSemaphore: AsyncLock = new AsyncLock();
  private localQueueKey = 'lq1';

  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER) private logger: WinstonLogger,
    @repository(ResourceLockRepository)
    private resourceLockRepository: ResourceLockRepository,
    @service(TransactionService)
    private transactionService: TransactionService,
  ) {}

  public async executeLocking<T>(
    task: (l: ResourceLock) => Promise<T>,
    locking: LockAcquisitionRequest,
  ): Promise<T> {
    const lockResult = await this.acquire(locking);
    if (!lockResult.acquired || !lockResult.lock) {
      throw new HttpErrors.Conflict(lockResult.reason);
    }
    try {
      return await task(lockResult.lock);
    } finally {
      try {
        await this.release(lockResult.lock);
      } catch (errReleasing) {
        this.logger.warn(
          `error occured releasing lock ${lockResult.lock.resourceCode}`,
          errReleasing,
        );
      }
    }
  }

  public async peek(resourceCode: string): Promise<ResourceLock | null> {
    ObjectUtils.notNull(resourceCode);

    const lock = await this.findActiveLock(resourceCode, true);

    return lock ?? null;
  }

  public async check(
    resourceCode: string,
    providedOwnerCode: string,
    required: boolean,
  ): Promise<void> {
    const lock = await this.findActiveLock(resourceCode, true);
    if (lock == null) {
      if (required) {
        throw new HttpErrors.Conflict(
          `Lock on resource ${resourceCode} is required but wasn't found`,
        );
      }
      return;
    }

    if (!providedOwnerCode?.length) {
      throw new HttpErrors.Conflict(
        `Lock on resource ${resourceCode} is required and was not provided`,
      );
    }

    if (lock.ownerCode !== providedOwnerCode) {
      throw new HttpErrors.Conflict(
        `Lock on resource ${resourceCode} is currently hold by another owner`,
      );
    }
  }

  public async acquire(
    request: LockAcquisitionRequest,
  ): Promise<LockAcquisitionAttemptResult> {
    let lastResponse: LockAcquisitionAttemptResult | null = null;
    let waitedFor = 0;
    const waitStep = request.retryEvery ?? 1000;
    let timedOut = false;

    while (!timedOut) {
      lastResponse = await this.withOptionalLocalThreadLocking(async () =>
        this.attemptAcquisition(request),
      );
      if (lastResponse.acquired) {
        break;
      }
      if (!request.timeout) {
        break;
      }
      if (waitedFor + waitStep <= request.timeout) {
        this.logger.debug(
          `waiting ${waitStep} ms before reattempting lock acquisition`,
        );
        await this.sleep(waitStep);
        waitedFor += waitStep;
      } else {
        this.logger.debug(
          `waiting for lock acquisition timed out after ${waitedFor} ms`,
        );
        timedOut = true;
        break;
      }
    }

    return {
      acquired: false,
      ...lastResponse,
      timedOut,
      waitedFor,
    };
  }

  public async release(
    request: LockDeleteRequest | ResourceLock,
  ): Promise<boolean> {
    return this.withOptionalLocalThreadLocking(async () =>
      this.attemptRelease(request),
    );
  }

  private async attemptRelease(
    body: LockDeleteRequest | ResourceLock,
  ): Promise<boolean> {
    ObjectUtils.notNull(body, body.resourceCode, body.ownerCode);

    this.logger.debug(
      `attempting lock release on resource ${body.resourceCode} by owner ${body.ownerCode}`,
    );

    const lockRaw = await this.findActiveLock(body.resourceCode, false);

    if (!lockRaw) {
      this.logger.warn(
        `no active lock on resource ${body.resourceCode} by owner ${body.ownerCode} to be released`,
      );
      return false;
    }

    await this.sleep(this.delayBeforeRelease);

    let lock: ResourceLock;
    if (this.synchronizeDatabaseRowOnRelease) {
      throw new HttpErrors.InternalServerError('UNSUPPORTED LOCK POLICY');
    } else {
      this.logger.debug(
        'skipped database row locking on release as of policy configuration',
      );
      lock = lockRaw;
    }

    if (lock.ownerCode !== body.ownerCode) {
      this.logger.warn(
        `Attempted releasing of lock owned by another owner on resource ${body.resourceCode} by owner ${body.ownerCode}, hold by ${lock.ownerCode}`,
      );
      return false;
    }

    try {
      await this.resourceLockRepository.delete(lock);
      await this.sleep(this.delayBeforeReleaseFlush);

      this.logger.debug(
        `released lock on resource ${body.resourceCode} by owner ${body.ownerCode}`,
      );

      return true;
    } catch (err) {
      this.logger.warn(
        `error releasing active lock on resource ${lock.resourceCode} by owner ${lock.ownerCode}`,
        err,
      );
      throw err;
    }
  }

  private async attemptAcquisition(
    body: LockAcquisitionRequest,
  ): Promise<LockAcquisitionAttemptResult> {
    try {
      return await this.transactionService.inTransaction(async transaction => {
        return this.attemptAcquisitionInsideTransaction(body, transaction);
      });
    } catch (err) {
      // mysql specific!
      if (err.code === 'ER_DUP_ENTRY') {
        return {
          acquired: false,
          lockedBySomeoneElse: true,
          reason: `Lock on resouce ${body.resourceCode} is already owned by another user. Additionally, a possible race condition occured.`,
        };
      }
      throw err;
    }
  }

  private async attemptAcquisitionInsideTransaction(
    body: LockAcquisitionRequest,
    transaction: juggler.Transaction,
  ): Promise<LockAcquisitionAttemptResult> {
    body = {
      ...body,
      ownerCode: body.ownerCode ?? uuidv4(),
    };

    ObjectUtils.notNull(body, body.resourceCode, body.ownerCode, body.duration);
    this.logger.debug(
      `attempting lock acquisition on resource ${body.resourceCode} by candidate owner ${body.ownerCode}`,
    );

    const existing = await this.findActiveLock(
      body.resourceCode,
      false,
      transaction,
    );

    if (existing) {
      if (existing.ownerCode === body.ownerCode) {
        // lock already owned, refreshing
        this.logger.debug(
          `lock on resource ${body.resourceCode} already owned by ${body.ownerCode}`,
        );
        const renewed = await this.renew(existing, body.duration, transaction);
        return {
          acquired: true,
          lock: renewed,
          lockedBySomeoneElse: false,
          renewed: true,
        };
      } else {
        // lock owned by another owner
        return {
          acquired: false,
          reason: `Lock on resource ${body.resourceCode} already acquired from another user.`,
          lockedBySomeoneElse: true,
        };
      }
    }

    await this.sleep(this.delayBeforeAcquisition);

    const newLock = await this.resourceLockRepository.create(
      new ResourceLock({
        resourceCode: body.resourceCode,
        ownerCode: body.ownerCode,
        expiresAt: new Date(new Date().getTime() + body.duration),
      }),
      {transaction},
    );

    await this.sleep(this.delayBeforeAcquisitionFlush);

    this.logger.debug(
      `acquired new lock on resource ${body.resourceCode} by owner ${body.ownerCode} with id ${newLock.id}`,
    );

    return {
      acquired: true,
      lock: newLock,
    };
  }

  private async renew(
    existing: ResourceLock,
    newDuration: number,
    transaction?: juggler.Transaction,
  ): Promise<ResourceLock> {
    const newExpirationDate = new Date(new Date().getTime() + newDuration);

    if (
      existing.expiresAt != null &&
      existing.expiresAt.getTime() < newExpirationDate.getTime()
    ) {
      this.logger.debug(
        `extending active lock on resource ${existing.resourceCode} owned by ${
          existing.ownerCode
        } to ${newExpirationDate.toISOString()}`,
      );

      existing.expiresAt = newExpirationDate;
      await this.resourceLockRepository.update(existing, {transaction});
    }

    return existing;
  }

  private async findActiveLock(
    resourceCode: string,
    readOnly: boolean,
    transaction?: juggler.Transaction,
  ): Promise<ResourceLock | null> {
    this.logger.debug(`finding active locks for resource ${resourceCode}`);
    const lockAttivi = await this.resourceLockRepository.find(
      {
        where: {
          resourceCode: {
            eq: resourceCode,
          },
        },
      },
      {transaction},
    );

    if (!lockAttivi.length) {
      this.logger.debug(`no active locks on resource ${resourceCode}`);
      return null;
    }

    this.logger.debug(
      `found ${lockAttivi.length} active locks on resource ${resourceCode}`,
    );

    const now = new Date();
    let validOne: ResourceLock | null = null;
    for (const lock of lockAttivi) {
      if (!this.isExpired(lock, now)) {
        this.logger.debug(`found active lock on resource ${resourceCode}`);
        if (validOne == null) {
          validOne = lock;
        } else {
          throw new HttpErrors.InternalServerError(
            `Found multiple active locks on resource ${resourceCode}`,
          );
        }
      } else if (!readOnly) {
        await this.processExpiredLock(lock, transaction);
      }
    }

    return validOne;
  }

  private isExpired(entity: ResourceLock, at: Date): boolean {
    return (
      entity.expiresAt != null && entity.expiresAt.getTime() <= at.getTime()
    );
  }

  private async processExpiredLock(
    entity: ResourceLock,
    transaction?: juggler.Transaction,
  ): Promise<void> {
    this.logger.warn(
      `removing record for expired lock on resource ${entity.resourceCode} with id ${entity.id}`,
    );

    await this.resourceLockRepository.delete(entity, {transaction});
  }

  protected async sleep(duration: number): Promise<void> {
    if (duration <= 0) {
      return;
    }
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  private async withOptionalLocalThreadLocking<T>(
    task: () => Promise<T>,
  ): Promise<T> {
    return this.localSemaphore.acquire(this.localQueueKey, task);
  }
}
