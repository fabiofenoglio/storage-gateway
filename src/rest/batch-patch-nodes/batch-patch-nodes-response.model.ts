import {Model, model, property} from '@loopback/repository';

@model({
  name: 'BatchPatchNodesResponse',
})
export class BatchPatchNodesResponse extends Model {
  @property({
    type: 'number',
    jsonSchema: {
      type: 'integer',
      format: 'int64',
    },
  })
  patchedNodes: number;

  constructor(data?: Partial<BatchPatchNodesResponse>) {
    super(data);
  }
}
