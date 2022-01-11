import {model} from '@loopback/repository';
import {AbstractContent} from '../content/abstract-content.model';

@model()
export class MemoryContent extends AbstractContent {
  constructor(data?: Partial<MemoryContent>) {
    super(data);
  }
}
