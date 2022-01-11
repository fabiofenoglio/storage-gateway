import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {
  del,
  get,
  getModelSchemaRef,
  param,
  post,
  requestBody,
  Response,
  RestBindings,
} from '@loopback/rest';
import {
  CreateNodeShareRequest,
  CreateNodeShareResponse,
} from '../rest/create-node-share';
import {GetNodeShareResponse} from '../rest/get-node-share';
import {
  ListNodeSharesRequest,
  ListNodeSharesResponse,
} from '../rest/list-node-shares';
import {Security} from '../security';
import {EntityResolverService} from '../services';
import {NodeShareService} from '../services/node-share.service';
import {PaginationUtils} from '../utils/pagination-utils';
import {RequestUtils} from '../utils/request-utils';

const OAS_CONTROLLER_NAME = 'NodeShare';

@authenticate({
  strategy: 'token',
  options: {required: Security.SCOPES.DOC_USAGE},
})
export class NodeShareController {
  constructor(
    @inject(RestBindings.Http.RESPONSE) private response: Response,
    @service(NodeShareService) private shareService: NodeShareService,
    @service(EntityResolverService)
    private entityResolverService: EntityResolverService,
  ) {}

  @get('/tenant/{tenantUUID}/items/{itemUUID}/shares', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'listNodeShares',
    responses: {
      '200': {
        description: 'The node share at the specified UUID',
        content: {
          'application/json': {
            schema: getModelSchemaRef(ListNodeSharesResponse, {
              title: 'ListNodeSharesResponse',
            }),
          },
        },
      },
    },
  })
  async listShare(
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
        $ref: getModelSchemaRef(ListNodeSharesRequest, {
          title: 'ListNodeSharesRequest',
        }).$ref,
      },
      {required: false},
    )
    filter?: ListNodeSharesRequest,
  ): Promise<ListNodeSharesResponse> {
    const resolved = await this.entityResolverService.resolveNode(
      tenantUUID,
      itemUUID,
      undefined,
      Security.Permissions.OWNER,
    );

    const itemLookup = await this.shareService.listShare(
      resolved.tenant,
      resolved.node,
      PaginationUtils.parsePagination(page, size),
      RequestUtils.parse(filter),
    );

    return itemLookup.dto;
  }

  @post('/tenant/{tenantUUID}/items/{itemUUID}/shares', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'createNodeShare',
    responses: {
      '201': {
        description: 'Create a share on the specified node',
        content: {
          'application/json': {
            schema: getModelSchemaRef(CreateNodeShareResponse, {
              title: 'CreateNodeShareResponse',
            }),
          },
        },
      },
    },
  })
  async createShare(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CreateNodeShareRequest, {
            title: 'CreateNodeShareRequest',
          }),
        },
      },
    })
    request: CreateNodeShareRequest,
  ): Promise<CreateNodeShareResponse> {
    const resolved = await this.entityResolverService.resolveNode(
      tenantUUID,
      itemUUID,
      undefined,
      Security.Permissions.OWNER,
    );

    const itemLookup = await this.shareService.createShare(
      resolved.tenant,
      resolved.node,
      request,
    );

    this.response.status(201);
    return itemLookup;
  }

  @get('/tenant/{tenantUUID}/items/{itemUUID}/shares/{shareUUID}', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'getNodeShare',
    responses: {
      '200': {
        description: 'The specific node share at the specified UUID',
        content: {
          'application/json': {
            schema: getModelSchemaRef(GetNodeShareResponse, {
              title: 'GetNodeShareResponse',
            }),
          },
        },
      },
    },
  })
  async getShare(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @param.path.string('shareUUID') shareUUID: string,
  ): Promise<GetNodeShareResponse> {
    const resolved = await this.entityResolverService.resolveNodeShare(
      tenantUUID,
      itemUUID,
      undefined,
      shareUUID,
      Security.Permissions.READ,
    );

    const itemLookup = await this.shareService.getShare(
      resolved.tenant,
      resolved.node,
      resolved.share.uuid,
    );

    return itemLookup.dto;
  }

  @del('/tenant/{tenantUUID}/items/{itemUUID}/shares/{shareUUID}', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'deleteNodeShare',
    responses: {
      '204': {
        description: 'No content',
      },
    },
  })
  async deleteShare(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @param.path.string('shareUUID') shareUUID: string,
  ): Promise<undefined> {
    const resolved = await this.entityResolverService.resolveNodeShare(
      tenantUUID,
      itemUUID,
      undefined,
      shareUUID,
      Security.Permissions.WRITE,
    );

    await this.shareService.deleteShare(
      resolved.tenant,
      resolved.node,
      resolved.share.uuid,
    );

    this.response.status(204);
    return undefined;
  }
}
