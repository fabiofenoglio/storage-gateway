import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {
  del,
  get,
  getModelSchemaRef,
  param,
  post,
  put,
  requestBody,
  Response,
  RestBindings,
} from '@loopback/rest';
import {GetMetadataResponse, UpdateMetadataRequest} from '../rest';
import {CreateMetadataRequest} from '../rest/create-metadata/create-metadata-request.model';
import {CreateMetadataResponse} from '../rest/create-metadata/create-metadata-response.model';
import {ListMetadataRequest} from '../rest/list-metadata/list-metadata-request.model';
import {ListMetadataResponse} from '../rest/list-metadata/list-metadata-response.model';
import {UpdateMetadataResponse} from '../rest/update-metadata/update-metadata-response.model';
import {Security} from '../security';
import {EntityResolverService} from '../services';
import {NodeMetadataService} from '../services/node-metadata.service';
import {PaginationUtils} from '../utils/pagination-utils';
import {RequestUtils} from '../utils/request-utils';

const OAS_CONTROLLER_NAME = 'NodeMetadata';

@authenticate({
  strategy: 'token',
  options: {required: Security.SCOPES.DOC_USAGE},
})
export class NodeMetadataController {
  constructor(
    @inject(RestBindings.Http.RESPONSE) private response: Response,
    @service(NodeMetadataService) private metadataService: NodeMetadataService,
    @service(EntityResolverService)
    private entityResolverService: EntityResolverService,
  ) {}

  @get('/tenant/{tenantUUID}/items/{itemUUID}/metadata', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'listNodeMetadata',
    responses: {
      '200': {
        description: 'The node metadata at the specified UUID',
        content: {
          'application/json': {
            schema: getModelSchemaRef(ListMetadataResponse, {
              title: 'ListMetadataResponse',
            }),
          },
        },
      },
    },
  })
  async listMetadata(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @param.query.number('page', {
      required: false,
      schema: {
        type: 'integer',
        format: 'int32',
      },
    })
    page?: number,
    @param.query.number('size', {
      required: false,
      schema: {
        type: 'integer',
        format: 'int32',
      },
    })
    size?: number,
    @param.query.object(
      'filter',
      {
        $ref: getModelSchemaRef(ListMetadataRequest, {
          title: 'ListMetadataRequest',
        }).$ref,
      },
      {required: false},
    )
    filter?: ListMetadataRequest,
  ): Promise<ListMetadataResponse> {
    const resolved = await this.entityResolverService.resolveNode(
      tenantUUID,
      itemUUID,
      undefined,
      Security.Permissions.READ,
    );

    const itemLookup = await this.metadataService.listMetadata(
      resolved.tenant,
      resolved.node,
      PaginationUtils.parsePagination(page, size),
      RequestUtils.parse(filter),
    );

    return itemLookup.dto;
  }

  @post('/tenant/{tenantUUID}/items/{itemUUID}/metadata', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'createNodeMetadata',
    responses: {
      '201': {
        description: 'Create a metadata on the specified node',
        content: {
          'application/json': {
            schema: getModelSchemaRef(CreateMetadataResponse, {
              title: 'CreateMetadataResponse',
            }),
          },
        },
      },
    },
  })
  async createMetadata(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CreateMetadataRequest, {
            title: 'CreateMetadataRequest',
          }),
        },
      },
    })
    request: CreateMetadataRequest,
  ): Promise<CreateMetadataResponse> {
    const resolved = await this.entityResolverService.resolveNode(
      tenantUUID,
      itemUUID,
      undefined,
      Security.Permissions.WRITE,
    );

    const itemLookup = await this.metadataService.createMetadata(
      resolved.tenant,
      resolved.node,
      request,
    );

    this.response.status(201);
    return itemLookup;
  }

  @get('/tenant/{tenantUUID}/items/{itemUUID}/metadata/{metadataKey}', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'getNodeMetadata',
    responses: {
      '200': {
        description: 'The specific node metadata at the specified UUID',
        content: {
          'application/json': {
            schema: getModelSchemaRef(GetMetadataResponse, {
              title: 'GetMetadataResponse',
            }),
          },
        },
      },
    },
  })
  async getMetadata(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @param.path.string('metadataKey') metadataKey: string,
  ): Promise<GetMetadataResponse> {
    const resolved = await this.entityResolverService.resolveMetadata(
      tenantUUID,
      itemUUID,
      undefined,
      metadataKey,
      Security.Permissions.READ,
    );

    const itemLookup = await this.metadataService.getMetadata(
      resolved.tenant,
      resolved.node,
      resolved.metadata.key,
    );

    return itemLookup.dto;
  }

  @put('/tenant/{tenantUUID}/items/{itemUUID}/metadata/{metadataKey}', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'updateNodeMetadata',
    responses: {
      '200': {
        description: 'Create a metadata on the specified node',
        content: {
          'application/json': {
            schema: getModelSchemaRef(UpdateMetadataResponse, {
              title: 'UpdateMetadataResponse',
            }),
          },
        },
      },
    },
  })
  async updateMetadata(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @param.path.string('metadataKey') metadataKey: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(UpdateMetadataRequest, {
            title: 'UpdateMetadataRequest',
          }),
        },
      },
    })
    request: UpdateMetadataRequest,
  ): Promise<UpdateMetadataResponse> {
    const resolved = await this.entityResolverService.resolveMetadata(
      tenantUUID,
      itemUUID,
      undefined,
      metadataKey,
      Security.Permissions.WRITE,
    );

    const itemLookup = await this.metadataService.updateMetadata(
      resolved.tenant,
      resolved.node,
      resolved.metadata.key,
      request,
    );

    return itemLookup;
  }

  @del('/tenant/{tenantUUID}/items/{itemUUID}/metadata/{metadataKey}', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'deleteNodeMetadata',
    responses: {
      '204': {
        description: 'No content',
      },
    },
  })
  async deleteMetadata(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @param.path.string('metadataKey') metadataKey: string,
  ): Promise<undefined> {
    const resolved = await this.entityResolverService.resolveMetadata(
      tenantUUID,
      itemUUID,
      undefined,
      metadataKey,
      Security.Permissions.WRITE,
    );

    await this.metadataService.deleteMetadata(
      resolved.tenant,
      resolved.node,
      resolved.metadata.key,
    );

    this.response.status(204);
    return undefined;
  }
}
