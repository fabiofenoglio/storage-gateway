import {model} from '@loopback/repository';
import {ListNodesRequest} from './list-nodes-request.model';

@model()
export class ListRootNodesRequest extends ListNodesRequest {
  constructor(data?: Partial<ListRootNodesRequest>) {
    super(data);
  }
}
