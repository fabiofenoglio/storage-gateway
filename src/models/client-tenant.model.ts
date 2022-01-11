import {Entity, model, property} from '@loopback/repository';
import {SupportedEncryptionAlgorithm} from './crypto/crypto-models.model';

@model({
  name: 'doc_client_tenant',
})
export class ClientTenant extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id?: number;

  @property({
    type: 'number',
    required: true,
  })
  engineVersion: number = ClientTenantVersion.V1;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  code: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  name: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  backboneType: string;

  @property({
    type: 'number',
    required: true,
  })
  backboneId: number;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 2048,
    },
  })
  rootLocation: string;

  @property({
    type: 'string',
    mysql: {
      dataType: 'varchar',
      dataLength: 512,
    },
  })
  ownerIdentifier: string;

  @property({
    type: 'boolean',
    required: false,
  })
  enableThumbnails: boolean;

  @property({
    type: 'string',
    required: false,
    mysql: {
      dataType: 'varchar',
      dataLength: 100,
    },
  })
  encryptionAlgorithm: SupportedEncryptionAlgorithm;

  constructor(data?: Partial<ClientTenant>) {
    super(data);
  }
}

export interface ClientTenantRelations {
  // describe navigational properties here
}

export type ClientTenantWithRelations = ClientTenant & ClientTenantRelations;

export enum ClientTenantVersion {
  V1 = 1,
}

export enum ClientTenantBackbone {
  ONEDRIVE = 'ONEDRIVE',
  FILESYSTEM = 'FILESYSTEM',
  MEMORY = 'MEMORY',
  S3 = 'S3',
}
