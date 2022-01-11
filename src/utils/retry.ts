/* eslint-disable @typescript-eslint/no-explicit-any */
import {WinstonLogger} from '@loopback/logging';
import {HttpErrors} from '@loopback/rest';
import {promisify} from 'util';

/**
 * A task that can be retried
 */
export type RetriableTask<T> = () => Promise<T>;

/**
 * Options for retry
 */
export interface RetryOptions {
  /**
   * Maximum number of retries excluding the first run.
   */
  maxRetries?: number;

  /**
   * Milliseconds to wait after each try
   */
  interval?: number;

  /**
   * linear increase backoff factor for the delay.
   * default value is 0 (no linear backoff)
   */
  linearBackoff?: number;

  /**
   * exponential increase backoff factor for the delay.
   * default value is 1.00 (no exponential increase)
   */
  exponentialBackoff?: number;

  /**
   * the maximum delay after all linear and exponential backoff are applied.
   */
  maxDelay?: number;

  /**
   * the contextual logger
   */
  logger?: WinstonLogger | null;

  /**
   * task description
   */
  description: string;

  /**
   * a function to check wether a retry can be made or not
   */
  canRetry?: (err: Error) => boolean | Promise<boolean>;
}

/**
 * Retry a task for number of times with the given interval in ms
 * @param task Task object {run, description}
 * @param maxTries Maximum number of tries (including the first run),
 * default to 10
 * @param interval Milliseconds to wait after each try, default to 100ms
 */
export async function retry<T>(
  task: RetriableTask<T>,
  retryOptions?: RetryOptions,
): Promise<T> {
  const logger = retryOptions?.logger;
  const startedAt = new Date();
  const maxTries = retryOptions?.maxRetries ?? 10;
  let numAttempts = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    logger?.debug(
      `attempting task ${retryOptions?.description} (${numAttempts}/${maxTries})`,
    );
    let lastError: any;

    try {
      const result = await task();
      return result;
    } catch (err) {
      lastError = err;

      if (retryOptions?.canRetry) {
        const canRetryResult = await retryOptions.canRetry(err);
        if (!canRetryResult) {
          logger?.error(
            'unretriable error in task attempt ' + retryOptions?.description,
            err,
          );
          throw err;
        }
      }

      logger?.error(
        'retriable error in task attempt ' + retryOptions?.description,
        err,
      );
    }

    if (++numAttempts <= maxTries) {
      const ttw = computeDelay(numAttempts, retryOptions);
      logger?.debug('waiting for ' + ttw + ' ms before retrying');
      await sleep(ttw);
    } else {
      // No more retries, timeout
      const msg = `failed all ${numAttempts} attempts for task ${
        retryOptions?.description
      } after ${new Date().getTime() - startedAt.getTime()} ms`;
      logger?.error(msg);
      throw lastError ?? new HttpErrors.RequestTimeout(msg);
    }
  }
}

const computeDelay = (failedAttempts: number, options?: RetryOptions) => {
  const linear = options?.linearBackoff ?? 0;
  const exp = options?.exponentialBackoff ?? 1.0;
  const interval = options?.interval ?? 100;
  const max = options?.maxDelay;

  const computed = Math.round(
    interval + // default fixed
      interval * (failedAttempts - 1) * linear + // linear increase
      interval * (Math.pow(exp, failedAttempts - 1) - 1), // exponential increase
  );

  if (max && computed > max) {
    return max;
  }
  return computed;
};

/**
 * Sleep for the given milliseconds
 * @param ms Number of milliseconds to wait
 */
export const sleep = promisify(setTimeout); // (ms: number) => Promise<void>

export interface AttemptResult<T> {
  result?: T;
  error?: any;
}

export async function attempt<T>(
  task: () => Promise<T>,
  cb?: (r: AttemptResult<T>) => void,
): Promise<AttemptResult<T>> {
  try {
    const r = await task();
    const out = {result: r};
    if (cb) {
      cb(out);
    }
    return out;
  } catch (err) {
    const out = {error: err};
    if (cb) {
      cb(out);
    }
    return out;
  }
}
