import {model, property} from '@loopback/repository';
import {ProtoS3BackboneTenant} from './proto-s3-backbone-tenant.model';
import {S3BackboneCredentials} from './s3-backbone-credentials.model';

export enum S3BackboneDialect {
  // tested
  IBM = 'IBM',
  GCP = 'GCP',
  ORACLE = 'ORACLE',
  BACKBLAZE = 'BACKBLAZE',
  // untested
  AWS = 'AWS',
  MINIO = 'MINIO',
}

export enum S3BackboneAuthenticationSchema {
  HMAC = 'HMAC',
  SIGNATURE_V4 = 'SIGNATURE_V4',
}

@model({
  name: 'doc_s3_backbone_tenant',
})
export class S3BackboneTenant extends ProtoS3BackboneTenant {
  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 1024,
    },
  })
  endpoint: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  authenticationSchema: string;

  @property({
    type: 'string',
    required: false,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  region?: string;

  @property({
    type: 'string',
    required: false,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  dialect?: string;

  @property({
    type: 'boolean',
  })
  enableSsl?: boolean;

  @property({
    type: S3BackboneCredentials,
    required: true,
  })
  credentials?: S3BackboneCredentials;

  constructor(data?: Partial<S3BackboneTenant>) {
    super(data);
  }
}

export interface S3BackboneTenantRelations {
  // describe navigational properties here
}

export type S3BackboneTenantWithRelations = S3BackboneTenant &
  S3BackboneTenantRelations;
