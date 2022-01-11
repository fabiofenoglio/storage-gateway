/* eslint-disable @typescript-eslint/naming-convention */
import {model, property} from '@loopback/repository';
import {AbstractContent} from '../content/abstract-content.model';

@model({
  name: 'doc_filesystem_content',
  settings: {
    foreignKeys: {
      fk_fsContent_nodeId: {
        name: 'fk_fsContent_nodeId',
        entity: 'StorageNode',
        entityKey: 'id',
        foreignKey: 'nodeId',
      },
      fk_fsContent_nodeUuid: {
        name: 'fk_fsContent_nodeUuid',
        entity: 'StorageNode',
        entityKey: 'uuid',
        foreignKey: 'nodeUuid',
      },
    },
  },
})
export class FilesystemContent extends AbstractContent {
  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 2048,
    },
  })
  storagePath: string;

  constructor(data?: Partial<FilesystemContent>) {
    super(data);
  }
}

export interface FilesystemContentRelations {
  // describe navigational properties here
}

export type FilesystemContentWithRelations = FilesystemContent &
  FilesystemContentRelations;
