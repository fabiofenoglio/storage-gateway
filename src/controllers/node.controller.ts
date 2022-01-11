import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {
  del,
  get,
  getModelSchemaRef,
  HttpErrors,
  param,
  patch,
  post,
  put,
  requestBody,
  Response,
  RestBindings,
} from '@loopback/rest';
import {RawUploadDto, StorageNode, StorageNodeType} from '../models';
import {
  CreateNodeRequest,
  CreateNodeResponse,
  PatchNodeRequest,
  PatchNodeResponse,
  UpdateNodeRequest,
  UpdateNodeResponse,
} from '../rest';
import {
  CreateNodeWithContentRequestData,
  OAS_SPEC_CREATE_NODE_WITH_CONTENT_REQUEST,
} from '../rest/create-content/create-content-request.model';
import {GetNodeResponse} from '../rest/get-node/get-node-response.model';
import {ListNodesRequest} from '../rest/list-nodes/list-nodes-request.model';
import {ListNodesResponse} from '../rest/list-nodes/list-nodes-response.model';
import {ListRootNodesRequest} from '../rest/list-nodes/list-root-nodes-request.model';
import {Security} from '../security';
import {
  ContentService,
  EntityResolverService,
  TransactionService,
} from '../services';
import {StorageNodeService} from '../services/storage-node.service';
import {ObjectUtils} from '../utils';
import {PaginationUtils} from '../utils/pagination-utils';
import {RequestUtils} from '../utils/request-utils';

const OAS_CONTROLLER_NAME = 'Node';

@authenticate({
  strategy: 'token',
  options: {required: Security.SCOPES.DOC_USAGE},
})
export class NodeController {
  constructor(
    @inject(RestBindings.Http.RESPONSE) private response: Response,
    @service(StorageNodeService) private storageNodeService: StorageNodeService,
    @service(ContentService) private contentService: ContentService,
    @service(EntityResolverService)
    private entityResolverService: EntityResolverService,
    @service(TransactionService)
    private transactionService: TransactionService,
  ) {}

  /*
    GET on ROOT - list items in root or in path
  */
  @get('/tenant/{tenantUUID}/items', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'listRootNodes',
    responses: {
      '200': {
        description: 'Nodes in the specified tenant root',
        content: {
          'application/json': {
            schema: getModelSchemaRef(ListNodesResponse, {
              title: 'ListNodesResponse',
            }),
          },
        },
      },
    },
  })
  async listRootNodes(
    @param.path.string('tenantUUID') tenantUUID: string,
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
    @param.query.string('path', {required: false}) path?: string,
    @param.query.object(
      'filter',
      {
        $ref: getModelSchemaRef(ListRootNodesRequest, {
          title: 'ListRootNodesRequest',
        }).$ref,
      },
      {required: false},
    )
    filter?: ListRootNodesRequest,
  ): Promise<ListNodesResponse> {
    const pageable = PaginationUtils.parsePagination(page, size);
    const parsedFilter = RequestUtils.parse(filter);

    const resolved = await this.entityResolverService.resolveNodeOrRoot(
      tenantUUID,
      null,
      path,
      Security.Permissions.READ,
    );

    if (resolved.node) {
      return this.storageNodeService.getChildren(
        resolved.tenant,
        resolved.node.uuid,
        pageable,
        parsedFilter,
      );
    }

    return this.storageNodeService.getRootItems(
      resolved.tenant,
      pageable,
      parsedFilter,
    );
  }

  /*
    POST on ROOT - create item in root or in path
  */
  @post('/tenant/{tenantUUID}/items', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'createNode',
    responses: {
      '201': {
        description: 'Created node instance',
        content: {
          'application/json': {
            schema: getModelSchemaRef(CreateNodeResponse, {
              title: 'CreateNodeResponse',
            }),
          },
        },
      },
    },
  })
  async createInRoot(
    @param.path.string('tenantUUID') tenantUUID: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CreateNodeRequest, {
            title: 'CreateNodeRequest',
          }),
        },
      },
    })
    request: CreateNodeRequest,
    @param.query.string('path', {required: false}) path?: string,
  ): Promise<CreateNodeResponse> {
    if (!request) {
      throw new HttpErrors.BadRequest();
    }

    const resolved = await this.entityResolverService.resolveClosestNodeToPath(
      tenantUUID,
      null,
      path,
      Security.Permissions.WRITE,
    );

    let result: CreateNodeResponse;

    if (resolved.remainingPath) {
      result = await (
        await this.storageNodeService.createChildrenInNewDirectory(
          resolved.tenant,
          resolved.node ?? null,
          resolved.remainingPath,
          request,
        )
      ).dtoProvider();
    } else if (resolved.node) {
      result = await (
        await this.storageNodeService.createChildren(
          resolved.tenant,
          resolved.node.uuid,
          request,
        )
      ).dtoProvider();
    } else {
      result = await (
        await this.storageNodeService.createInRoot(resolved.tenant, request)
      ).dtoProvider();
    }

    this.response.status(201);
    return result;
  }

  /*
    POST on ROOT - create item in root or in path
  */
  @post('/tenant/{tenantUUID}/upload', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'uploadFile',
    responses: {
      '201': {
        description: 'Created node instance with content',
        content: {
          'application/json': {
            schema: getModelSchemaRef(CreateNodeResponse, {
              title: 'CreateNodeResponse',
            }),
          },
        },
      },
    },
  })
  async createInRootWithContent(
    @param.path.string('tenantUUID') tenantUUID: string,
    @requestBody(OAS_SPEC_CREATE_NODE_WITH_CONTENT_REQUEST)
    rawRequest: RawUploadDto,
    @param.query.string('path', {required: false}) path?: string,
  ): Promise<CreateNodeResponse> {
    if (!rawRequest) {
      throw new HttpErrors.BadRequest();
    }

    // resolve requested parent node
    const resolved = await this.entityResolverService.resolveClosestNodeToPath(
      tenantUUID,
      null,
      path,
      Security.Permissions.WRITE,
    );

    // read parsed request data
    const request = ObjectUtils.require(
      rawRequest,
      'parsedData',
    ) as CreateNodeWithContentRequestData;

    if (
      !request.nodeName?.trim()?.length &&
      !request.fileName?.trim()?.length
    ) {
      throw new HttpErrors.UnprocessableEntity(
        'NodeName or FileName is required',
      );
    }
    if (!request.contentType?.trim()?.length) {
      throw new HttpErrors.UnprocessableEntity('ContentType is required');
    }

    request.nodeName = request.nodeName ?? request.fileName;
    request.fileName = request.fileName ?? request.nodeName;

    // build create node request
    const createNodeRequest = new CreateNodeRequest({
      name: ObjectUtils.require(request, 'nodeName'),
      type: StorageNodeType.FILE,
      metadata: request.metadata ?? [],
    });

    // open transaction
    const result = await this.transactionService.inTransaction(
      async transaction => {
        let createdNodeInTx: StorageNode;
        let createdNodeDTOProvider: () => Promise<CreateNodeResponse>;

        if (resolved.remainingPath) {
          const creationResult =
            await this.storageNodeService.createChildrenInNewDirectory(
              resolved.tenant,
              resolved.node ?? null,
              resolved.remainingPath,
              createNodeRequest,
              transaction,
            );
          createdNodeInTx = creationResult.entity;
          createdNodeDTOProvider = creationResult.dtoProvider;
        } else if (resolved.node) {
          const creationResult = await this.storageNodeService.createChildren(
            resolved.tenant,
            resolved.node.uuid,
            createNodeRequest,
            transaction,
          );
          createdNodeInTx = creationResult.entity;
          createdNodeDTOProvider = creationResult.dtoProvider;
        } else {
          const creationResult = await this.storageNodeService.createInRoot(
            resolved.tenant,
            createNodeRequest,
            transaction,
          );
          createdNodeInTx = creationResult.entity;
          createdNodeDTOProvider = creationResult.dtoProvider;
        }

        // create content in same transaction
        const createdContent = await this.contentService.createContent(
          resolved.tenant,
          createdNodeInTx,
          rawRequest,
          undefined,
          transaction,
        );

        const dto = await createdNodeDTOProvider();
        dto.content = createdContent.dto;
        return dto;
      },
    );

    this.response.status(201);
    return result;
  }

  /*
    PUT on ROOT - update item by obligatory path
  */
  @put('/tenant/{tenantUUID}/items', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'updateNodeByPath',
    responses: {
      '201': {
        description: 'Created node instance',
        content: {
          'application/json': {
            schema: getModelSchemaRef(CreateNodeResponse, {
              title: 'CreateNodeResponse',
            }),
          },
        },
      },
    },
  })
  async updateNodeByPath(
    @param.path.string('tenantUUID') tenantUUID: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(UpdateNodeRequest, {
            title: 'UpdateNodeRequest',
          }),
        },
      },
    })
    request: UpdateNodeRequest,
    @param.query.string('path', {required: true}) path: string,
  ): Promise<UpdateNodeResponse> {
    if (!request) {
      throw new HttpErrors.BadRequest();
    }

    const resolved = await this.entityResolverService.resolveNode(
      tenantUUID,
      null,
      path,
      Security.Permissions.WRITE,
    );

    return this.storageNodeService.updateNode(
      resolved.tenant,
      resolved.node.uuid,
      request,
    );
  }

  /*
    PATCH on ROOT - patch item by obligatory path
  */
  @patch('/tenant/{tenantUUID}/items', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'patchNodeByPath',
    responses: {
      '200': {
        description: 'Updated node instance',
        content: {
          'application/json': {
            schema: getModelSchemaRef(PatchNodeResponse, {
              title: 'PatchNodeResponse',
            }),
          },
        },
      },
    },
  })
  async patchNodeByPath(
    @param.path.string('tenantUUID') tenantUUID: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(PatchNodeRequest, {
            title: 'PatchNodeRequest',
          }),
        },
      },
    })
    request: PatchNodeRequest,
    @param.query.string('path', {required: true}) path: string,
  ): Promise<PatchNodeResponse> {
    const resolved = await this.entityResolverService.resolveNode(
      tenantUUID,
      null,
      path,
      Security.Permissions.WRITE,
    );

    const updateResult = await this.storageNodeService.patchNode(
      resolved.tenant,
      resolved.node.uuid,
      request,
    );

    return updateResult;
  }

  /*
    DELETE on ROOT - patch item by obligatory path
  */
  @del('/tenant/{tenantUUID}/items', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'deleteNodeByPath',
    responses: {
      '204': {
        description: 'No content',
      },
    },
  })
  async deleteNodeByPath(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.query.string('path', {required: true}) path: string,
  ): Promise<undefined> {
    const resolved = await this.entityResolverService.resolveNode(
      tenantUUID,
      null,
      path,
      Security.Permissions.WRITE,
    );

    await this.storageNodeService.deleteNode(
      resolved.tenant,
      resolved.node.uuid,
    );

    this.response.status(204);
    return undefined;
  }

  /*
    GET by UUID - get single item by UUID or by subpath
  */
  @get('/tenant/{tenantUUID}/items/{itemUUID}', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'getNode',
    responses: {
      '200': {
        description: 'The node at the specified UUID',
        content: {
          'application/json': {
            schema: getModelSchemaRef(GetNodeResponse, {
              title: 'GetNodeResponse',
            }),
          },
        },
      },
    },
  })
  async getNode(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @param.query.string('path', {required: false}) path?: string,
  ): Promise<GetNodeResponse> {
    const resolved = await this.entityResolverService.resolveNode(
      tenantUUID,
      itemUUID,
      path,
      Security.Permissions.READ,
    );

    return (
      await this.storageNodeService.getNode(resolved.tenant, resolved.node.uuid)
    ).dto;
  }

  /*
    PUT by UUID - update single item by UUID or by subpath
  */
  @put('/tenant/{tenantUUID}/items/{itemUUID}', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'updateNode',
    responses: {
      '200': {
        description: 'Updated node instance',
        content: {
          'application/json': {
            schema: getModelSchemaRef(UpdateNodeResponse, {
              title: 'UpdateNodeResponse',
            }),
          },
        },
      },
    },
  })
  async updateNode(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(UpdateNodeRequest, {
            title: 'UpdateNodeRequest',
          }),
        },
      },
    })
    request: UpdateNodeRequest,
    @param.query.string('path', {required: false}) path?: string,
  ): Promise<UpdateNodeResponse> {
    const resolved = await this.entityResolverService.resolveNode(
      tenantUUID,
      itemUUID,
      path,
      Security.Permissions.WRITE,
    );

    return this.storageNodeService.updateNode(
      resolved.tenant,
      resolved.node.uuid,
      request,
    );
  }

  /*
    PATCH by UUID - patch single item by UUID or by subpath
  */
  @patch('/tenant/{tenantUUID}/items/{itemUUID}', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'patchNode',
    responses: {
      '200': {
        description: 'Updated node instance',
        content: {
          'application/json': {
            schema: getModelSchemaRef(PatchNodeResponse, {
              title: 'PatchNodeResponse',
            }),
          },
        },
      },
    },
  })
  async patchNode(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(PatchNodeRequest, {
            title: 'PatchNodeRequest',
          }),
        },
      },
    })
    request: PatchNodeRequest,
    @param.query.string('path', {required: false}) path?: string,
  ): Promise<PatchNodeResponse> {
    const resolved = await this.entityResolverService.resolveNode(
      tenantUUID,
      itemUUID,
      path,
      Security.Permissions.WRITE,
    );

    const updateResult = await this.storageNodeService.patchNode(
      resolved.tenant,
      resolved.node.uuid,
      request,
    );

    return updateResult;
  }

  /*
    DELETE by UUID - delete single item by UUID or by subpath
  */
  @del('/tenant/{tenantUUID}/items/{itemUUID}', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'deleteNode',
    responses: {
      '204': {
        description: 'No content',
      },
    },
  })
  async deleteNode(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @param.query.string('path', {required: false}) path?: string,
  ): Promise<undefined> {
    const resolved = await this.entityResolverService.resolveNode(
      tenantUUID,
      itemUUID,
      path,
      Security.Permissions.WRITE,
    );

    await this.storageNodeService.deleteNode(
      resolved.tenant,
      resolved.node.uuid,
    );

    this.response.status(204);
    return undefined;
  }

  /*
    GET children by UUID - get item children by UUID or by subpath
  */
  @get('/tenant/{tenantUUID}/items/{itemUUID}/children', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'listNodeChildren',
    responses: {
      '200': {
        description: 'The children node list at the specified UUID',
        content: {
          'application/json': {
            schema: getModelSchemaRef(ListNodesResponse, {
              title: 'ListNodesResponse',
            }),
          },
        },
      },
    },
  })
  async listChildren(
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
        $ref: getModelSchemaRef(ListNodesRequest, {title: 'ListNodesRequest'})
          .$ref,
      },
      {required: false},
    )
    filter?: ListNodesRequest,
    @param.query.string('path', {required: false}) path?: string,
  ): Promise<ListNodesResponse> {
    const resolved = await this.entityResolverService.resolveNode(
      tenantUUID,
      itemUUID,
      path,
      Security.Permissions.READ,
    );

    const pageable = PaginationUtils.parsePagination(page, size);
    const parsedFilter = RequestUtils.parse(filter);

    return this.storageNodeService.getChildren(
      resolved.tenant,
      resolved.node.uuid,
      pageable,
      parsedFilter,
    );
  }

  /*
    POST by UUID - create item in node by UUID or by subpath
  */
  @post('/tenant/{tenantUUID}/items/{itemUUID}/children', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'createNodeChildren',
    responses: {
      '201': {
        description: 'Created node instance',
        content: {
          'application/json': {
            schema: getModelSchemaRef(CreateNodeResponse, {
              title: 'CreateNodeResponse',
            }),
          },
        },
      },
    },
  })
  async createChildren(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CreateNodeRequest, {
            title: 'CreateNodeRequest',
          }),
        },
      },
    })
    request: CreateNodeRequest,
    @param.query.string('path', {required: false}) path?: string,
  ): Promise<CreateNodeResponse> {
    const resolved = await this.entityResolverService.resolveClosestNodeToPath(
      tenantUUID,
      itemUUID,
      path,
      Security.Permissions.WRITE,
    );

    let result: CreateNodeResponse;

    if (resolved.remainingPath) {
      result = await (
        await this.storageNodeService.createChildrenInNewDirectory(
          resolved.tenant,
          resolved.node!,
          resolved.remainingPath ?? undefined,
          request,
        )
      ).dtoProvider();
    } else {
      result = await (
        await this.storageNodeService.createChildren(
          resolved.tenant,
          resolved.node!.uuid,
          request,
        )
      ).dtoProvider();
    }

    this.response.status(201);
    return result;
  }

  @post('/tenant/{tenantUUID}/items/{itemUUID}/upload', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'uploadChildren',
    responses: {
      '201': {
        description: 'Created node instance with content',
        content: {
          'application/json': {
            schema: getModelSchemaRef(CreateNodeResponse, {
              title: 'CreateNodeResponse',
            }),
          },
        },
      },
    },
  })
  async createChildrenWithContent(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @requestBody(OAS_SPEC_CREATE_NODE_WITH_CONTENT_REQUEST)
    rawRequest: RawUploadDto,
    @param.query.string('path', {required: false}) path?: string,
  ): Promise<CreateNodeResponse> {
    const resolved = await this.entityResolverService.resolveClosestNodeToPath(
      tenantUUID,
      itemUUID,
      path,
      Security.Permissions.WRITE,
    );

    // read parsed request data
    const request = ObjectUtils.require(
      rawRequest,
      'parsedData',
    ) as CreateNodeWithContentRequestData;

    if (
      !request.nodeName?.trim()?.length &&
      !request.fileName?.trim()?.length
    ) {
      throw new HttpErrors.UnprocessableEntity(
        'NodeName or FileName is required',
      );
    }
    if (!request.contentType?.trim()?.length) {
      throw new HttpErrors.UnprocessableEntity('ContentType is required');
    }

    request.nodeName = request.nodeName ?? request.fileName;
    request.fileName = request.fileName ?? request.nodeName;

    // build create node request
    const createNodeRequest = new CreateNodeRequest({
      name: ObjectUtils.require(request, 'nodeName'),
      type: StorageNodeType.FILE,
      metadata: request.metadata ?? [],
    });

    // open transaction
    const result = await this.transactionService.inTransaction(
      async transaction => {
        let createdNodeInTx: StorageNode;
        let createdNodeDTOProvider: () => Promise<CreateNodeResponse>;

        if (resolved.remainingPath) {
          const creationResult =
            await this.storageNodeService.createChildrenInNewDirectory(
              resolved.tenant,
              resolved.node ?? null,
              resolved.remainingPath,
              createNodeRequest,
              transaction,
            );
          createdNodeInTx = creationResult.entity;
          createdNodeDTOProvider = creationResult.dtoProvider;
        } else {
          const creationResult = await this.storageNodeService.createChildren(
            resolved.tenant,
            resolved.node!.uuid,
            createNodeRequest,
            transaction,
          );
          createdNodeInTx = creationResult.entity;
          createdNodeDTOProvider = creationResult.dtoProvider;
        }

        // create content in same transaction
        const createdContent = await this.contentService.createContent(
          resolved.tenant,
          createdNodeInTx,
          rawRequest,
          undefined,
          transaction,
        );

        const dto = await createdNodeDTOProvider();
        dto.content = createdContent.dto;
        return dto;
      },
    );

    this.response.status(201);
    return result;
  }
}
