import {Model, model, property} from '@loopback/repository';

@model({
  name: 'BatchDeleteNodesResponse',
})
export class BatchDeleteNodesResponse extends Model {
  @property({
    type: 'number',
    jsonSchema: {
      type: 'integer',
      format: 'int64',
    },
  })
  deletedNodes: number;

  constructor(data?: Partial<BatchDeleteNodesResponse>) {
    super(data);
  }
}
