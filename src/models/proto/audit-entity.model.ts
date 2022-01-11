import {Entity, property} from '@loopback/repository';

export abstract class AuditEntity extends Entity {
  @property({
    type: 'number',
    required: true,
  })
  version: number;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  createdBy: string;

  @property({
    type: 'date',
    required: true,
  })
  createdAt: Date;

  @property({
    type: 'string',
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  modifiedBy?: string;

  @property({
    type: 'date',
  })
  modifiedAt?: Date;
}
