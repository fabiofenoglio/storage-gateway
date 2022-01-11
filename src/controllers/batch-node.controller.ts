import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {
  del,
  getModelSchemaRef,
  patch,
  post,
  requestBody,
  Response,
  RestBindings,
} from '@loopback/rest';
import {BatchDeleteNodesRequest} from '../rest/batch-delete-nodes/batch-delete-nodes-request.model';
import {BatchDeleteNodesResponse} from '../rest/batch-delete-nodes/batch-delete-nodes-response.model';
import {BatchGetNodesRequest} from '../rest/batch-get-nodes/batch-get-nodes-request.model';
import {BatchGetNodesResponse} from '../rest/batch-get-nodes/batch-get-nodes-response.model';
import {BatchPatchNodesRequest} from '../rest/batch-patch-nodes/batch-patch-nodes-request.model';
import {BatchPatchNodesResponse} from '../rest/batch-patch-nodes/batch-patch-nodes-response.model';
import {Security} from '../security';
import {EntityResolverService} from '../services';
import {StorageNodeService} from '../services/storage-node.service';
import {RequestUtils} from '../utils';

const OAS_CONTROLLER_NAME = 'BatchNode';

@authenticate({
  strategy: 'token',
  options: {required: Security.SCOPES.DOC_USAGE},
})
export class BatchNodeController {
  constructor(
    @inject(RestBindings.Http.RESPONSE) private response: Response,
    @service(StorageNodeService) private storageNodeService: StorageNodeService,
    @service(EntityResolverService)
    private entityResolverService: EntityResolverService,
  ) {}

  /*
    GET - get items in batch by filter
  */
  @post('/tenant/batch/search', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'searchNodesBatch',
    responses: {
      '200': {
        description: 'A resume of the found nodes',
        content: {
          'application/json': {
            schema: getModelSchemaRef(BatchGetNodesResponse, {
              title: 'BatchGetNodesResponse',
            }),
          },
        },
      },
    },
  })
  async searchNodesBatch(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(BatchGetNodesRequest, {
            title: 'BatchGetNodesRequest',
          }),
        },
      },
    })
    request: BatchGetNodesRequest,
  ): Promise<BatchGetNodesResponse> {
    request.where = RequestUtils.parse(request.where);

    return this.storageNodeService.searchNodesBatch(request);
  }

  /*
    PATCH - patch items in batch by filter
  */
  @patch('/tenant/batch', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'patchNodesBatch',
    responses: {
      '200': {
        description: 'A resume of the patched nodes',
        content: {
          'application/json': {
            schema: getModelSchemaRef(BatchPatchNodesResponse, {
              title: 'BatchPatchNodesResponse',
            }),
          },
        },
      },
    },
  })
  async patchNodesBatch(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(BatchPatchNodesRequest, {
            title: 'BatchPatchNodesRequest',
          }),
        },
      },
    })
    request: BatchPatchNodesRequest,
  ): Promise<BatchPatchNodesResponse> {
    request.where = RequestUtils.parse(request.where);
    return this.storageNodeService.patchNodesBatch(request);
  }

  /*
    DELETE - delete items in batch by filter
  */
  @del('/tenant/batch', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'deleteNodesBatch',
    responses: {
      '200': {
        description: 'A resume of the deleted nodes',
        content: {
          'application/json': {
            schema: getModelSchemaRef(BatchDeleteNodesResponse, {
              title: 'BatchDeleteNodesResponse',
            }),
          },
        },
      },
    },
  })
  async deleteNodesBatch(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(BatchDeleteNodesRequest, {
            title: 'BatchDeleteNodesRequest',
          }),
        },
      },
    })
    request: BatchDeleteNodesRequest,
  ): Promise<BatchDeleteNodesResponse> {
    request.where = RequestUtils.parse(request.where);
    return this.storageNodeService.deleteNodesBatch(request);
  }
}
