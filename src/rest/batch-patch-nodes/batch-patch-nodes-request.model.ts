import {model, property} from '@loopback/repository';
import {BatchNodesSelectorRequest} from '../batch-nodes/batch-nodes-selector.model';
import {PatchNodeRequest} from '../patch-node';

@model({
  name: 'BatchPatchNodesRequest',
})
export class BatchPatchNodesRequest extends PatchNodeRequest {
  @property({
    type: BatchNodesSelectorRequest,
    required: true,
  })
  where: BatchNodesSelectorRequest;

  constructor(data?: Partial<BatchPatchNodesRequest>) {
    super(data);
  }
}
