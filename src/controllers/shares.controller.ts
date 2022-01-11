import {inject, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {
  get,
  HttpErrors,
  operation,
  param,
  Request,
  Response,
  RestBindings,
} from '@loopback/rest';
import {LoggerBindings} from '../key';
import {StorageNodeShareType} from '../models';
import {DeferredContentRetriever} from '../models/content/content-models.model';
import {
  ContentRetrieveRequestConditions,
  ContentService,
  EntityResolverService,
} from '../services';
import {NodeShareService} from '../services/node-share.service';
import {RequestUtils} from '../utils/request-utils';

const OAS_CONTROLLER_NAME = 'Share';

/*
 * NOT AUTHENTICATED AT CLASS LEVEL BECAUSE OF PUBLIC ENDPOINTS
 */
export class SharesController {
  constructor(
    @inject(LoggerBindings.ROOT_LOGGER) private logger: WinstonLogger,
    @inject(RestBindings.Http.REQUEST) private request: Request,
    @inject(RestBindings.Http.RESPONSE) private response: Response,
    @service(NodeShareService) private shareService: NodeShareService,
    @service(ContentService) private contentService: ContentService,
    @service(EntityResolverService)
    private entityResolverService: EntityResolverService,
  ) {}

  @get('/shares/{accessToken}/content', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'getShareContent',
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
  //@oas.response.file()
  async getShareContent(@param.path.string('accessToken') accessToken: string) {
    const resolved = await this.entityResolverService.resolveDirectShare(
      accessToken,
    );

    // allow access to this endpoint only when share type is EMBED
    if (resolved.share.type !== StorageNodeShareType.EMBED) {
      throw new HttpErrors.Forbidden(
        'Content embed not allowed for this share.',
      );
    }

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

  @operation('head', '/shares/{accessToken}/content', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'getShareContentHead',
    responses: {
      '204': {
        description: 'No content',
      },
    },
  })
  //@oas.response.file()
  async getShareContentHead(
    @param.path.string('accessToken') accessToken: string,
  ) {
    const resolved = await this.entityResolverService.resolveDirectShare(
      accessToken,
    );

    // allow access to this endpoint only when share type is EMBED
    if (resolved.share.type !== StorageNodeShareType.EMBED) {
      throw new HttpErrors.Forbidden(
        'Content embed not allowed for this share.',
      );
    }

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

  @get('/shares/{accessToken}/assets/{assetKey}', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'getShareContentAsset',
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
  //@oas.response.file()
  async getShareContentAsset(
    @param.path.string('accessToken') accessToken: string,
    @param.path.string('assetKey') assetKey: string,
  ) {
    const resolved = await this.entityResolverService.resolveDirectShare(
      accessToken,
    );

    // allow access to this endpoint only when share type is EMBED
    if (resolved.share.type !== StorageNodeShareType.EMBED) {
      throw new HttpErrors.Forbidden(
        'Content embed not allowed for this share.',
      );
    }

    // retrieve content from service
    const data: DeferredContentRetriever =
      await this.contentService.retrieveContentAsset(
        resolved.tenant,
        resolved.node,
        assetKey,
        this.getContentRetrieveConditions(
          this.request,
          resolved.asset?.contentSize,
        ),
      );

    await RequestUtils.serveContent(
      this.logger,
      data,
      this.request,
      this.response,
    );
  }

  @operation('head', '/shares/{accessToken}/assets/{assetKey}', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'getShareContentAssetHead',
    responses: {
      '204': {
        description: 'No content',
      },
    },
  })
  async getShareContentAssetHead(
    @param.path.string('accessToken') accessToken: string,
    @param.path.string('assetKey') assetKey: string,
  ) {
    const resolved = await this.entityResolverService.resolveDirectShare(
      accessToken,
    );

    // allow access to this endpoint only when share type is EMBED
    if (resolved.share.type !== StorageNodeShareType.EMBED) {
      throw new HttpErrors.Forbidden(
        'Content embed not allowed for this share.',
      );
    }

    // retrieve content from service
    const data: DeferredContentRetriever =
      await this.contentService.retrieveContentAsset(
        resolved.tenant,
        resolved.node,
        assetKey,
        this.getContentRetrieveConditions(
          this.request,
          resolved.asset?.contentSize,
        ),
      );

    await RequestUtils.serveContentHead(
      this.logger,
      data,
      this.request,
      this.response,
    );
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
