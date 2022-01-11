import {juggler} from '@loopback/repository';
import {ClientProfile} from '../services';

export interface RestContext {
  client: ClientProfile | string;
  transaction?: juggler.Transaction;
}
