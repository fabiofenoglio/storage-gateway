import {Entity, model, property} from '@loopback/repository';

@model({
  name: 'doc_cronjob',
  settings: {},
})
export class Cronjob extends Entity {
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
  name: string;

  constructor(data?: Partial<Cronjob>) {
    super(data);
  }
}

export interface CronjobRelations {
  // describe navigational properties here
}

export type CronjobWithRelations = Cronjob & CronjobRelations;
