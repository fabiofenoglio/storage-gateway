import {inject, injectable, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import AWS from 'aws-sdk';
import {ConfigurationBindings, LoggerBindings} from '../../key';
import {S3BackboneAuthenticationSchema, S3BackboneTenant} from '../../models';
import {ObjectUtils} from '../../utils';
import {
  AppCustomConfig,
  AppCustomS3Config,
} from '../../utils/configuration-utils';
import {S3DialectManager} from './s3-dialect-manager.service';

@injectable()
export class S3ClientService {
  private clients: {[key: number]: AWS.S3} = {};

  constructor(
    @inject(LoggerBindings.S3_LOGGER) private logger: WinstonLogger,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private rootConfiguration: AppCustomConfig,
    @service(S3DialectManager)
    private s3DialectManager: S3DialectManager,
  ) {}

  get s3Config(): AppCustomS3Config {
    return this.rootConfiguration.s3;
  }

  public async getClient(backBone: S3BackboneTenant): Promise<AWS.S3> {
    const key = ObjectUtils.require(backBone, 'id');
    if (!this.clients[key]) {
      const config = this.s3Config;
      const dialectHandler = this.s3DialectManager.getDialectHandler(
        backBone.dialect,
      );

      const credentials = ObjectUtils.require(backBone, 'credentials');

      let clientConfig: AWS.S3.ClientConfiguration = {
        endpoint: ObjectUtils.require(backBone, 'endpoint'),
        sslEnabled: backBone.enableSsl ?? undefined,
        s3ForcePathStyle: config.s3ForcePathStyle ?? true,
        region: backBone.region ?? undefined,
      };

      if (
        backBone.authenticationSchema === S3BackboneAuthenticationSchema.HMAC
      ) {
        clientConfig.credentials = {
          accessKeyId: ObjectUtils.require(credentials, 'accessKeyId'),
          secretAccessKey: ObjectUtils.require(credentials, 'secretAccessKey'),
        };
      } else {
        throw new Error(
          'Unsupported authentication schema ' + backBone.authenticationSchema,
        );
      }

      if (dialectHandler?.configureClient) {
        clientConfig = await dialectHandler.configureClient(
          backBone,
          clientConfig,
        );
      }

      this.logger.debug('builindg S3 service client', {
        ...clientConfig,
        credentials: {
          ...clientConfig.credentials,
          secretAccessKey: '************',
        },
      });

      const client = new AWS.S3(clientConfig);

      // assign client just built and validated
      this.clients[key] = client;
    }
    return this.clients[key];
  }
}
