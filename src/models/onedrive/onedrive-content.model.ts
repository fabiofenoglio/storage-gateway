/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/naming-convention */
import {model, property} from '@loopback/repository';
import {AbstractContent} from '../content/abstract-content.model';

@model({
  name: 'doc_onedrive_content',
  settings: {
    foreignKeys: {
      fk_odContent_nodeId: {
        name: 'fk_odContent_nodeId',
        entity: 'StorageNode',
        entityKey: 'id',
        foreignKey: 'nodeId',
      },
      fk_odContent_nodeUuid: {
        name: 'fk_odContent_nodeUuid',
        entity: 'StorageNode',
        entityKey: 'uuid',
        foreignKey: 'nodeUuid',
      },
    },
  },
})
export class OnedriveContent extends AbstractContent {
  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 2048,
    },
  })
  onedrivePath: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  onedriveId: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 1024,
    },
  })
  onedriveETag: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 1024,
    },
  })
  onedriveCTag: string;

  @property({
    type: 'any',
    required: true,
    mysql: {
      dataType: 'text',
    },
  })
  onedriveItem: any;

  constructor(data?: Partial<OnedriveContent>) {
    super(data);
  }
}

export interface OnedriveContentRelations {
  // describe navigational properties here
}

export type OnedriveContentWithRelations = OnedriveContent &
  OnedriveContentRelations;
