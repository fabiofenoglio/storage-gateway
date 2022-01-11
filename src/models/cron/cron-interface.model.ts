import {CronjobExecution} from './cronjob-execution.model';

export interface CronJobConfiguration {
  name: string;
  schedule: string;
  allowOverlapping?: boolean;
}

export interface CronJobExecutionContext {
  job: CronJobConfiguration;
  startedAt: Date;
  finishedAt?: Date;
  errored?: boolean;
  reportedMessages?: CronJobReportedMessage[];
  execution?: CronjobExecution;
}

export enum CronJobReportedMessageLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

export interface CronJobReportedMessage {
  reportedAt: Date;
  level: CronJobReportedMessageLevel;
  message: string;
  name?: string;
  additionals?: object;
}
