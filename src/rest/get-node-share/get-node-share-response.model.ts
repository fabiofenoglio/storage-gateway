import {model} from '@loopback/repository';
import {NodeShareDto} from '../dto/node-share-dto.model';

@model()
export class GetNodeShareResponse extends NodeShareDto {
  constructor(data?: Partial<GetNodeShareResponse>) {
    super(data);
  }
}
