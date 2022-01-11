import {model} from '@loopback/repository';
import {NodeShareDto} from '../dto/node-share-dto.model';

@model()
export class CreateNodeShareResponse extends NodeShareDto {
  constructor(data?: Partial<CreateNodeShareResponse>) {
    super(data);
  }
}
