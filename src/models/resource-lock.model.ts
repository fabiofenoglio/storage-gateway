import {Entity, model, property} from '@loopback/repository';

@model({
  name: 'doc_resource_lock',
  settings: {},
})
export class ResourceLock extends Entity {
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
    },
  })
  resourceCode: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  ownerCode: string;

  @property({
    type: 'date',
    required: true,
  })
  expiresAt: Date;

  constructor(data?: Partial<ResourceLock>) {
    super(data);
  }
}

export interface ResourceLockRelations {
  // describe navigational properties here
}

export type ResourceLockWithRelations = ResourceLock & ResourceLockRelations;
