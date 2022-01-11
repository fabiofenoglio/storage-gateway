import {Entity, model, property} from '@loopback/repository';

@model({
  name: 'doc_msgraph_token',
})
export class MsGraphToken extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id?: number;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
      columnName: 'tokenType',
    },
  })
  tokenType: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
      columnName: 'scope',
    },
  })
  scope: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 8192,
      columnName: 'accessToken',
    },
  })
  accessToken: string;

  @property({
    type: 'string',
    mysql: {
      dataType: 'varchar',
      dataLength: 8192,
      columnName: 'refreshToken',
    },
  })
  refreshToken?: string;

  @property({
    type: 'date',
    mysql: {
      columnName: 'expiresAt',
    },
  })
  expiresAt?: Date;

  @property({
    type: 'date',
    required: true,
    mysql: {
      columnName: 'issuedAt',
    },
  })
  issuedAt: Date;

  @property({
    type: 'date',
    required: false,
    mysql: {
      columnName: 'requestedAt',
    },
  })
  requestedAt?: Date;

  @property({
    type: 'date',
    required: false,
    mysql: {
      columnName: 'refreshedAt',
    },
  })
  refreshedAt?: Date;

  @property({
    type: 'date',
    required: false,
    mysql: {
      columnName: 'refreshRequestedAt',
    },
  })
  refreshRequestedAt?: Date;

  @property({
    type: 'number',
    mysql: {
      columnName: 'expiresIn',
    },
  })
  expiresIn?: number;

  @property({
    type: 'number',
    mysql: {
      columnName: 'extExpiresIn',
    },
  })
  extExpiresIn?: number;

  @property({
    type: 'string',
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
      columnName: 'userPrincipalName',
    },
  })
  userPrincipalName: string;

  @property({
    type: 'string',
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
      columnName: 'userPrincipalId',
    },
  })
  userPrincipalId: string;

  @property({
    type: 'string',
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  associatedClient: string;

  constructor(data?: Partial<MsGraphToken>) {
    super(data);
  }
}

export interface MsGraphTokenRelations {
  // describe navigational properties here
}

export type MsGraphTokenWithRelations = MsGraphToken & MsGraphTokenRelations;
