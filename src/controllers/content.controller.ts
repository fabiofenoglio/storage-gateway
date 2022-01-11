import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {
  del,
  get,
  getModelSchemaRef,
  HttpErrors,
  operation,
  param,
  post,
  put,
  Request,
  requestBody,
  Response,
  RestBindings,
} from '@loopback/rest';
import {LoggerBindings} from '../key';
import {DeferredContentRetriever} from '../models/content/content-models.model';
import {RawUploadDto} from '../models/content/content-upload-dto.model';
import {OAS_SPEC_CREATE_CONTENT_REQUEST} from '../rest/create-content/create-content-request.model';
import {CreateContentResponse} from '../rest/create-content/create-content-response.model';
import {UpdateContentResponse} from '../rest/update-content/update-content-response.model';
import {Security} from '../security';
import {
  ContentRetrieveRequestConditions,
  EntityResolverService,
} from '../services';
import {ContentService} from '../services/content/content.service';
import {RequestUtils} from '../utils/request-utils';

const OAS_CONTROLLER_NAME = 'NodeContent';

@authenticate({
  strategy: 'token',
  options: {required: Security.SCOPES.DOC_USAGE},
})
export class ContentController {
  constructor(
    @inject(LoggerBindings.ROOT_LOGGER) private logger: WinstonLogger,
    @inject(RestBindings.Http.REQUEST) private request: Request,
    @inject(RestBindings.Http.RESPONSE) private response: Response,
    @service(ContentService) private contentService: ContentService,
    @service(EntityResolverService)
    private entityResolverService: EntityResolverService,
  ) {}

  @post('/tenant/{tenantUUID}/items/{itemUUID}/content', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'createNodeContent',
    responses: {
      201: {
        content: {
          'application/json': {
            schema: getModelSchemaRef(CreateContentResponse, {
              title: 'CreateContentResponse',
            }),
          },
        },
        description: 'Upload node content',
      },
    },
  })
  async createItemContent(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @requestBody(OAS_SPEC_CREATE_CONTENT_REQUEST)
    request: RawUploadDto,
  ): Promise<CreateContentResponse> {
    try {
      if (!request) {
        throw new HttpErrors.BadRequest();
      }
      const resolved = await this.entityResolverService.resolveNode(
        tenantUUID,
        itemUUID,
        undefined,
        Security.Permissions.WRITE,
      );

      const response = await this.contentService.createContent(
        resolved.tenant,
        resolved.node,
        request,
      );

      this.response.status(201);
      return response.dto;
    } finally {
      await this.contentService.cleanup(request);
    }
  }

  @put('/tenant/{tenantUUID}/items/{itemUUID}/content', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'updateNodeContent',
    responses: {
      200: {
        content: {
          'application/json': {
            schema: getModelSchemaRef(UpdateContentResponse, {
              title: 'UpdateContentResponse',
            }),
          },
        },
        description: 'Upload node content',
      },
    },
  })
  async updateItemContent(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @requestBody(OAS_SPEC_CREATE_CONTENT_REQUEST)
    request: RawUploadDto,
  ): Promise<UpdateContentResponse> {
    try {
      if (!request) {
        throw new HttpErrors.BadRequest();
      }

      const resolved = await this.entityResolverService.resolveContent(
        tenantUUID,
        itemUUID,
        undefined,
        undefined,
        Security.Permissions.WRITE,
      );

      const response = await this.contentService.updateContent(
        resolved.tenant,
        resolved.node,
        request,
      );

      return response.dto;
    } finally {
      await this.contentService.cleanup(request);
    }
  }

  @get('/tenant/{tenantUUID}/items/{itemUUID}/content', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'getNodeContent',
    responses: {
      '200': {
        description: 'The file content',
        content: {
          'application/octet-stream': {
            schema: {
              type: 'string',
              format: 'binary',
            },
          },
        },
      },
    },
  })
  async getItemContent(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
  ) {
    const resolved = await this.entityResolverService.resolveContent(
      tenantUUID,
      itemUUID,
      undefined,
      undefined,
      Security.Permissions.READ,
    );

    // retrieve content from service
    const data: DeferredContentRetriever =
      await this.contentService.retrieveContent(
        resolved.tenant,
        resolved.node,
        this.getContentRetrieveConditions(
          this.request,
          resolved.content.contentSize,
        ),
      );

    await RequestUtils.serveContent(
      this.logger,
      data,
      this.request,
      this.response,
    );
  }

  @operation('head', '/tenant/{tenantUUID}/items/{itemUUID}/content', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'getNodeContentHead',
    responses: {
      '200': {
        description: 'No content',
      },
    },
  })
  async getItemContentHead(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
  ) {
    const resolved = await this.entityResolverService.resolveContent(
      tenantUUID,
      itemUUID,
      undefined,
      undefined,
      Security.Permissions.READ,
    );

    // retrieve content from service
    const data: DeferredContentRetriever =
      await this.contentService.retrieveContent(
        resolved.tenant,
        resolved.node,
        this.getContentRetrieveConditions(
          this.request,
          resolved.content.contentSize,
        ),
      );

    await RequestUtils.serveContentHead(
      this.logger,
      data,
      this.request,
      this.response,
    );
  }

  @get('/tenant/{tenantUUID}/items/{itemUUID}/assets/{assetKey}', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'getNodeContentAsset',
    responses: {
      '200': {
        description: 'The asset content',
        content: {
          'application/octet-stream': {
            schema: {
              type: 'string',
              format: 'binary',
            },
          },
        },
      },
    },
  })
  async getNodeContentAsset(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @param.path.string('assetKey') assetKey: string,
  ) {
    const resolved = await this.entityResolverService.resolveContentAsset(
      tenantUUID,
      itemUUID,
      undefined,
      undefined,
      assetKey,
      Security.Permissions.READ,
    );

    // retrieve content from service
    const data: DeferredContentRetriever =
      await this.contentService.retrieveContentAsset(
        resolved.tenant,
        resolved.node,
        assetKey,
        this.getContentRetrieveConditions(
          this.request,
          resolved.asset.contentSize,
        ),
      );

    await RequestUtils.serveContent(
      this.logger,
      data,
      this.request,
      this.response,
    );
  }

  @operation(
    'head',
    '/tenant/{tenantUUID}/items/{itemUUID}/assets/{assetKey}',
    {
      'x-controller-name': OAS_CONTROLLER_NAME,
      operationId: 'getNodeContentAssetHead',
      responses: {
        '200': {
          description: 'No content',
        },
      },
    },
  )
  async getNodeContentAssetHead(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @param.path.string('assetKey') assetKey: string,
  ) {
    const resolved = await this.entityResolverService.resolveContentAsset(
      tenantUUID,
      itemUUID,
      undefined,
      undefined,
      assetKey,
      Security.Permissions.READ,
    );

    // retrieve content from service
    const data: DeferredContentRetriever =
      await this.contentService.retrieveContentAsset(
        resolved.tenant,
        resolved.node,
        assetKey,
        this.getContentRetrieveConditions(
          this.request,
          resolved.asset.contentSize,
        ),
      );

    await RequestUtils.serveContentHead(
      this.logger,
      data,
      this.request,
      this.response,
    );
  }

  @del('/tenant/{tenantUUID}/items/{itemUUID}/content', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'deleteNodeContent',
    responses: {
      '204': {
        description: 'No content',
      },
    },
  })
  async deleteItemContent(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
  ): Promise<undefined> {
    const resolved = await this.entityResolverService.resolveContent(
      tenantUUID,
      itemUUID,
      undefined,
      undefined,
      Security.Permissions.WRITE,
    );

    await this.contentService.deleteContent(resolved.tenant, resolved.node);

    this.response.status(204);
    return undefined;
  }

  private getContentRetrieveConditions(
    request: Request,
    contentSize?: number,
  ): ContentRetrieveRequestConditions {
    return {
      ifNoneMatch: request.headers['if-none-match'],
      range: RequestUtils.validateRangeRequest(
        this.logger,
        request,
        contentSize,
      ),
    };
  }
}
