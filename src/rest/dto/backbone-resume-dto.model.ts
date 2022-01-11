import {Model, model, property} from '@loopback/repository';

@model()
export class BackboneResumeDto extends Model {
  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      type: 'integer',
      format: 'int64',
    },
  })
  id: number;

  @property({
    type: 'string',
    required: true,
  })
  name: string;

  constructor(data?: Partial<BackboneResumeDto>) {
    super(data);
  }
}
