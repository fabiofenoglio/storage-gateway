import {model, property} from '@loopback/repository';
import {AbstractBackbone} from '../proto/abstract-backbone.model';

@model({
  name: 'doc_filesystem_backbone_tenant',
})
export class FilesystemBackboneTenant extends AbstractBackbone {
  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 2048,
    },
  })
  relativePath: string;

  constructor(data?: Partial<FilesystemBackboneTenant>) {
    super(data);
  }
}

export interface FilesystemBackboneTenantRelations {
  // describe navigational properties here
}

export type FilesystemBackboneTenantWithRelations = FilesystemBackboneTenant &
  FilesystemBackboneTenantRelations;
