/* eslint-disable @typescript-eslint/naming-convention */
import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Cronjob} from './cronjob.model';

export enum CronjobExecutionStatus {
  RUNNING = 'RUNNING',
  FAILED = 'FAILED',
  FINISHED = 'FINISHED',
}

@model({
  name: 'doc_cronjob_execution',
  settings: {
    foreignKeys: {
      fk_cronjobExecution_jobId: {
        name: 'fk_cronjobExecution_jobId',
        entity: 'Cronjob',
        entityKey: 'id',
        foreignKey: 'jobId',
      },
    },
  },
})
export class CronjobExecution extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id?: number;

  @belongsTo(
    () => Cronjob,
    {},
    {
      mysql: {
        dataType: 'int',
      },
    },
  )
  jobId: number;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 100,
    },
    jsonSchema: {
      enum: Object.values(CronjobExecutionStatus),
    },
  })
  status: string;

  @property({
    type: 'date',
    required: true,
  })
  startedAt: Date;

  @property({
    type: 'date',
    required: false,
  })
  finishedAt?: Date;

  constructor(data?: Partial<CronjobExecution>) {
    super(data);
  }
}

export interface CronjobExecutionRelations {
  // describe navigational properties here
}

export type CronjobExecutionWithRelations = CronjobExecution &
  CronjobExecutionRelations;
