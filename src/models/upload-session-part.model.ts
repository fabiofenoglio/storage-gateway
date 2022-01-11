/* eslint-disable @typescript-eslint/naming-convention */
import {belongsTo, Entity, model, property} from '@loopback/repository';
import {UploadSession} from './upload-session.model';

export enum UploadSessionPartStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  DELETED = 'DELETED',
  CLEARED = 'CLEARED',
}

@model({
  name: 'doc_upload_session_part',
  settings: {
    foreignKeys: {
      fk_UploadSessionPart_sessionId: {
        name: 'fk_UploadSessionPart_sessionId',
        entity: 'UploadSession',
        entityKey: 'id',
        foreignKey: 'sessionId',
      },
    },
  },
})
export class UploadSessionPart extends Entity {
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
      dataLength: 100,
    },
  })
  uuid: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 100,
    },
    jsonSchema: {
      enum: Object.values(UploadSessionPartStatus),
    },
  })
  status: string;

  @property({
    type: 'date',
    required: false,
  })
  transitionedAt?: Date;

  @property({
    type: 'date',
    required: true,
  })
  uploadedAt: Date;

  @property({
    type: 'number',
    required: true,
  })
  partNumber: number;

  @property({
    type: 'number',
    required: true,
  })
  size: number;

  @belongsTo(
    () => UploadSession,
    {},
    {
      mysql: {
        dataType: 'int',
      },
    },
  )
  sessionId: number;

  constructor(data?: Partial<UploadSessionPart>) {
    super(data);
  }
}

export interface UploadSessionPartRelations {
  // describe navigational properties here
}

export type UploadSessionPartWithRelations = UploadSessionPart &
  UploadSessionPartRelations;
