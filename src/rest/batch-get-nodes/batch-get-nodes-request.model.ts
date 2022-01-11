import {Model, model, property} from '@loopback/repository';
import {BatchNodesSelectorRequest} from '../batch-nodes/batch-nodes-selector.model';

@model({
  name: 'BatchGetNodesRequest',
})
export class BatchGetNodesRequest extends Model {
  @property({
    type: BatchNodesSelectorRequest,
    required: true,
  })
  where: BatchNodesSelectorRequest;

  constructor(data?: Partial<BatchGetNodesRequest>) {
    super(data);
  }
}
