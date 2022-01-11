import AWS from 'aws-sdk';
import {S3BackboneDialect, S3BackboneTenant} from '../../../models';

export interface IS3DialectHandler {
  configureClient?(
    backBone: S3BackboneTenant,
    config: AWS.S3.ClientConfiguration,
  ): AWS.S3.ClientConfiguration | Promise<AWS.S3.ClientConfiguration>;

  getTresholdForSingleBufferingRequest?(): number;
  getTresholdForSinglePartUpload?(): number;
  getMultipartUploadPartSize?(): number;
  getSeparator?(): string;
  getSupportBatchDelete(): boolean;
}

export abstract class ProtoS3DialectHandler implements IS3DialectHandler {
  abstract get dialect(): S3BackboneDialect;

  configureClient?(
    backBone: S3BackboneTenant,
    config: AWS.S3.ClientConfiguration,
  ): AWS.S3.ClientConfiguration | Promise<AWS.S3.ClientConfiguration> {
    return config;
  }

  getSupportBatchDelete(): boolean {
    return true;
  }
}
