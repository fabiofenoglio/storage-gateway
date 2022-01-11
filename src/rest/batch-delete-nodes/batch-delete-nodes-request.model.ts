import {Model, model, property} from '@loopback/repository';
import {BatchNodesSelectorRequest} from '../batch-nodes/batch-nodes-selector.model';

@model({
  name: 'BatchDeleteNodesRequest',
})
export class BatchDeleteNodesRequest extends Model {
  @property({
    type: BatchNodesSelectorRequest,
    required: true,
  })
  where: BatchNodesSelectorRequest;

  constructor(data?: Partial<BatchDeleteNodesRequest>) {
    super(data);
  }
}
