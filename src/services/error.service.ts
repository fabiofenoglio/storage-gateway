import * as Rollbar from 'rollbar';

/* eslint-disable @typescript-eslint/no-explicit-any */
import {inject} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {Request, RestBindings} from '@loopback/rest';
import {SecurityBindings} from '@loopback/security';

import {ConfigurationBindings, LoggerBindings} from '../key';
import {AppCustomConfig, ConfigurationUtils} from '../utils';
import {ClientProfile} from './client-profile.service';

export class ErrorService {
  rollbarConfig: Rollbar.Configuration;
  rollbar: Rollbar;

  constructor(
    @inject(LoggerBindings.ROOT_LOGGER) private logger: WinstonLogger,
    @inject(SecurityBindings.USER, {optional: true})
    private client: ClientProfile,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
    @inject(RestBindings.Http.REQUEST, {optional: true}) private req?: Request,
  ) {
    this.rollbarConfig = {
      accessToken: configuration.errorHandling.rollbarToken,
      captureUncaught: false,
      captureUnhandledRejections: false,
      captureUsername: true,
      environment: ConfigurationUtils.getEnv(),
    };

    this.rollbar = new Rollbar.default(this.rollbarConfig);
  }

  get rollbarEnabled(): boolean {
    return this.configuration.errorHandling.enableRollbar;
  }

  async start() {
    // this.rollbar.debug('starting service', {startedAt: new Date()});
  }

  async stop?(): Promise<void> {
    // NOP
  }

  async reportError(
    message: string,
    additional: any = undefined,
  ): Promise<void> {
    if (!this.rollbarEnabled) {
      this.logger.warn('error reporting to rollbar is disabled.');
      this.logger.warn('reported error would be: ' + message);
      return;
    }

    this.safe(() =>
      this.rollbar.error(
        new Error(message),
        this.req ? this.toRollbarRequest(this.req, this.client) : undefined,
        additional,
      ),
    );
  }

  async reportWarning(
    message: string,
    additional: any = undefined,
  ): Promise<void> {
    if (!this.rollbarEnabled) {
      this.logger.warn('warning reporting to rollbar is disabled.');
      this.logger.warn('reported warning would be: ' + message);
      return;
    }

    this.safe(() =>
      this.rollbar.warn(
        new Error(message),
        this.req ? this.toRollbarRequest(this.req, this.client) : undefined,
        additional,
      ),
    );
  }

  async reportInfo(
    message: string,
    additional: any = undefined,
  ): Promise<void> {
    if (!this.rollbarEnabled) {
      this.logger.warn('info reporting to rollbar is disabled.');
      this.logger.warn('reported info would be: ' + message);
      return;
    }

    this.safe(() =>
      this.rollbar.info(
        new Error(message),
        this.req ? this.toRollbarRequest(this.req, this.client) : undefined,
        additional,
      ),
    );
  }

  async reportRequestError(
    error: Error,
    request: Request | undefined,
    client: ClientProfile | undefined,
    additional: any = undefined,
  ): Promise<void> {
    if (!this.rollbarEnabled) {
      this.logger.warn('error reporting to rollbar is disabled.');
      this.logger.warn('reported error would be', error);
      return;
    }

    this.safe(() =>
      this.rollbar.error(
        error,
        request ? this.toRollbarRequest(request, client) : undefined,
        additional,
      ),
    );
  }

  private safe(task: () => void) {
    try {
      task();
    } catch (err) {
      this.logger.error('ERROR REPORTING TO ROLLBAR', err);
    }
  }

  private toRollbarRequest(
    input: Request,
    client: ClientProfile | undefined,
  ): any {
    return {
      ...input,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      user_id: client ? client.code : undefined,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      rollbar_person: this.toRollbarPrincipal(client),
    };
  }

  private toRollbarPrincipal(client: ClientProfile | undefined): any {
    if (!client) {
      return undefined;
    }

    return {
      username: client.code,
    };
  }
}
