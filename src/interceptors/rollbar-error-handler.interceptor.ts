import {
  globalInterceptor,
  inject,
  Interceptor,
  InvocationContext,
  InvocationResult,
  Provider,
  ValueOrPromise,
} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {HttpErrors, Request, RestBindings} from '@loopback/rest';
import {SecurityBindings} from '@loopback/security';

import {ErrorBindings, LoggerBindings} from '../key';
import {ClientProfile, ErrorService} from '../services';

/**
 * This class will be bound to the application as an `Interceptor` during
 * `boot`
 */
@globalInterceptor('', {tags: {name: 'RollbarErrorHandler'}})
export class RollbarErrorHandlerInterceptor implements Provider<Interceptor> {
  constructor(
    @inject(LoggerBindings.ROOT_LOGGER) private logger: WinstonLogger,
    @inject(ErrorBindings.ERROR_SERVICE) private errorService: ErrorService,
    @inject(RestBindings.Http.REQUEST) private req: Request,
    @inject(SecurityBindings.USER, {optional: true})
    private client: ClientProfile,
  ) {}

  /**
   * This method is used by LoopBack context to produce an interceptor function
   * for the binding.
   *
   * @returns An interceptor function
   */
  value() {
    return this.intercept.bind(this);
  }

  /**
   * The logic to intercept an invocation
   * @param invocationCtx - Invocation context
   * @param next - A function to invoke next interceptor or the target method
   */
  async intercept(
    invocationCtx: InvocationContext,
    next: () => ValueOrPromise<InvocationResult>,
  ) {
    try {
      // Add pre-invocation logic here
      const result = await next();
      // Add post-invocation logic here
      return result;
    } catch (err) {
      let doReport = true;
      if (err instanceof HttpErrors.HttpError) {
        if (err.status < 500) {
          doReport = false;
        }
      }

      if (doReport) {
        this.logger.warn('request error', err);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.errorService.reportRequestError(err, this.req, this.client);
      }

      throw err;
    }
  }
}
