import {injectable} from '@loopback/core';
import {S3BackboneDialect, S3BackboneTenant} from '../../../models';
import {ProtoS3DialectHandler} from './proto-s3-dialect-handler.service';

@injectable()
export class MinIOS3DialectHandler extends ProtoS3DialectHandler {
  constructor() {
    super();
  }

  get dialect(): S3BackboneDialect {
    return S3BackboneDialect.MINIO;
  }

  configureClient?(
    backBone: S3BackboneTenant,
    config: AWS.S3.ClientConfiguration,
  ): AWS.S3.ClientConfiguration | Promise<AWS.S3.ClientConfiguration> {
    return {
      correctClockSkew: true,
      ...config,
    };
  }
}
