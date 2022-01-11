import {getModelSchemaRef} from '@loopback/openapi-v3';
import {Model, model, property} from '@loopback/repository';
import {RequestBodyObject} from 'openapi3-ts';
import {FORM_DATA} from '../../utils';
import {CreateMetadataRequest} from '../create-metadata';

@model({
  name: 'CreateNodeWithContentRequestData',
})
export class CreateNodeWithContentRequestData extends Model {
  @property({
    type: 'string',
    required: true,
  })
  nodeName: string;

  @property({
    type: 'string',
    required: true,
  })
  fileName: string;

  @property({
    type: 'string',
    required: true,
  })
  contentType: string;

  @property({
    type: 'string',
    required: false,
  })
  md5?: string;

  @property({
    type: 'string',
    required: false,
  })
  sha1?: string;

  @property({
    type: 'string',
    required: false,
  })
  sha256?: string;

  @property({
    type: 'array',
    itemType: CreateMetadataRequest,
  })
  metadata?: CreateMetadataRequest[];

  constructor(data?: Partial<CreateContentRequestData>) {
    super(data);
  }
}

@model({
  name: 'CreateContentRequestData',
})
export class CreateContentRequestData extends Model {
  @property({
    type: 'string',
    required: true,
  })
  fileName: string;

  @property({
    type: 'string',
    required: true,
  })
  contentType: string;

  @property({
    type: 'string',
    required: false,
  })
  md5?: string;

  @property({
    type: 'string',
    required: false,
  })
  sha1?: string;

  @property({
    type: 'string',
    required: false,
  })
  sha256?: string;

  constructor(data?: Partial<CreateContentRequestData>) {
    super(data);
  }
}

export const OAS_SPEC_CREATE_CONTENT_REQUEST: Partial<RequestBodyObject> = {
  description: 'multipart/form-data value.',
  required: true,
  content: {
    [FORM_DATA]: {
      schema: {
        title: 'CreateContentRequest',
        type: 'object',
        properties: {
          file: {
            format: 'binary',
            type: 'string',
          },
          data: getModelSchemaRef(CreateContentRequestData),
        },
      },
    },
  },
};

export const OAS_SPEC_CREATE_NODE_WITH_CONTENT_REQUEST: Partial<RequestBodyObject> =
  {
    description: 'multipart/form-data value.',
    required: true,
    content: {
      [FORM_DATA]: {
        schema: {
          title: 'CreateNodeWithContentRequest',
          type: 'object',
          properties: {
            file: {
              format: 'binary',
              type: 'string',
            },
            data: getModelSchemaRef(CreateNodeWithContentRequestData),
          },
          required: [],
        },
      },
    },
  };
