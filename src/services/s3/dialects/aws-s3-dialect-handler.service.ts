import {injectable} from '@loopback/core';
import {S3BackboneDialect, S3BackboneTenant} from '../../../models';
import {ProtoS3DialectHandler} from './proto-s3-dialect-handler.service';

@injectable()
export class AWSS3DialectHandler extends ProtoS3DialectHandler {
  constructor() {
    super();
  }

  get dialect(): S3BackboneDialect {
    return S3BackboneDialect.AWS;
  }

  configureClient?(
    backBone: S3BackboneTenant,
    config: AWS.S3.ClientConfiguration,
  ): AWS.S3.ClientConfiguration | Promise<AWS.S3.ClientConfiguration> {
    return {
      correctClockSkew: true,
      ...config,
      apiVersion: '2006-03-01',
      signatureVersion: 'v4',
    };
  }
}
