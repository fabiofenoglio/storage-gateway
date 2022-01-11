import {injectable} from '@loopback/core';
import {S3BackboneDialect} from '../../../models';
import {ProtoS3DialectHandler} from './proto-s3-dialect-handler.service';

@injectable()
export class GCPS3DialectHandler extends ProtoS3DialectHandler {
  constructor() {
    super();
  }

  get dialect(): S3BackboneDialect {
    return S3BackboneDialect.GCP;
  }

  getSupportBatchDelete(): boolean {
    return false;
  }
}
