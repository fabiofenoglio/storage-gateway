import {BindingScope, inject, injectable, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {LoggerBindings} from '../../key';
import {S3BackboneDialect} from '../../models';
import {AWSS3DialectHandler, IBMS3DialectHandler} from './dialects';
import {GCPS3DialectHandler} from './dialects/gcp-s3-dialect-handler.service';
import {MinIOS3DialectHandler} from './dialects/minio-s3-dialect-handler.service';
import {
  IS3DialectHandler,
  ProtoS3DialectHandler,
} from './dialects/proto-s3-dialect-handler.service';

@injectable({scope: BindingScope.SINGLETON})
export class S3DialectManager {
  private registeredHandlers: {[key: string]: IS3DialectHandler} = {};

  constructor(
    @inject(LoggerBindings.S3_LOGGER)
    private logger: WinstonLogger,
    @service(IBMS3DialectHandler)
    private ibmS3DialectHandler: IBMS3DialectHandler,
    @service(AWSS3DialectHandler)
    private awsS3DialectHandler: AWSS3DialectHandler,
    @service(MinIOS3DialectHandler)
    private minIOS3DialectHandler: MinIOS3DialectHandler,
    @service(GCPS3DialectHandler)
    private gcpS3DialectHandler: GCPS3DialectHandler,
  ) {
    [
      awsS3DialectHandler,
      ibmS3DialectHandler,
      minIOS3DialectHandler,
      gcpS3DialectHandler,
    ].forEach(handler => this.register(handler));
  }

  private register(handler: ProtoS3DialectHandler): void {
    const t = handler.dialect;
    if (this.registeredHandlers[t]) {
      throw new Error('Duplicate S3 dialect handler for dialect ' + t);
    }
    this.registeredHandlers[t] = handler;
  }

  public getDialectHandler(
    dialect: S3BackboneDialect | string | undefined,
  ): IS3DialectHandler | null {
    if (!dialect) {
      return null;
    }

    const handler = this.registeredHandlers[dialect];

    if (!handler) {
      this.logger.debug('Missing S3 dialect handler for dialect ' + dialect);
      return null;
    }

    return handler;
  }
}
