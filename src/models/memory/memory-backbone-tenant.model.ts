import {model} from '@loopback/repository';
import {AbstractBackbone} from '../proto';

@model()
export class MemoryBackboneTenant extends AbstractBackbone {
  constructor(data?: Partial<MemoryBackboneTenant>) {
    super(data);
  }
}
