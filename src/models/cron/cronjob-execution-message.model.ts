/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {belongsTo, Entity, model, property} from '@loopback/repository';
import {CronJobReportedMessageLevel} from './cron-interface.model';
import {CronjobExecution} from './cronjob-execution.model';

@model({
  name: 'doc_cronjob_execution_message',
  settings: {
    foreignKeys: {
      fk_CronjobExecutionMessage_executionId: {
        name: 'fk_CronjobExecutionMessage_executionId',
        entity: 'CronjobExecution',
        entityKey: 'id',
        foreignKey: 'executionId',
      },
    },
  },
})
export class CronjobExecutionMessage extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id?: number;

  @belongsTo(
    () => CronjobExecution,
    {},
    {
      mysql: {
        dataType: 'int',
      },
    },
  )
  executionId: number;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 100,
    },
    jsonSchema: {
      enum: Object.values(CronJobReportedMessageLevel),
    },
  })
  level: string;

  @property({
    type: 'date',
    required: true,
  })
  reportedAt: Date;

  @property({
    type: 'string',
    required: false,
    mysql: {
      dataType: 'varchar',
      dataLength: 1024,
    },
  })
  name?: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'text',
    },
  })
  message: string;

  @property({
    type: 'any',
    required: false,
    mysql: {
      dataType: 'text',
    },
  })
  additionals: any;

  constructor(data?: Partial<CronjobExecutionMessage>) {
    super(data);
  }
}

export interface CronjobExecutionMessageRelations {
  // describe navigational properties here
}

export type CronjobExecutionMessageWithRelations = CronjobExecutionMessage &
  CronjobExecutionMessageRelations;
