import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {
  del,
  getModelSchemaRef,
  HttpErrors,
  param,
  post,
  Request,
  requestBody,
  RequestBodyObject,
  Response,
  RestBindings,
} from '@loopback/rest';
import {RawUploadDto} from '../models/content/content-upload-dto.model';
import {
  CreateContentResponse,
  CreateUploadSessionRequest,
  CreateUploadSessionResponse,
} from '../rest';
import {Security} from '../security';
import {ContentService, EntityResolverService} from '../services';
import {MultipartUploadService} from '../services/multipart-upload.service';
import {FORM_DATA} from '../utils';

const OAS_CONTROLLER_NAME = 'UploadSession';

const OAS_CONTENT_PART_UPLOAD_SPEC: Partial<RequestBodyObject> = {
  description: 'multipart/form-data value.',
  required: true,
  content: {
    [FORM_DATA]: {
      schema: {
        title: 'ContentPartUploadRequest',
        type: 'object',
        properties: {
          file: {
            format: 'binary',
            type: 'string',
          },
          metadata: {
            title: 'ContentPartUploadMetadata',
            type: 'object',
            properties: {
              md5: {
                type: 'string',
              },
              sha1: {
                type: 'string',
              },
              sha256: {
                type: 'string',
              },
            },
          },
        },
      },
    },
  },
};
@authenticate({
  strategy: 'token',
  options: {required: Security.SCOPES.DOC_USAGE},
})
export class UploadSessionController {
  constructor(
    @inject(RestBindings.Http.REQUEST)
    private req: Request,
    @inject(RestBindings.Http.RESPONSE)
    private response: Response,
    @service(MultipartUploadService)
    private uploadService: MultipartUploadService,
    @service(EntityResolverService)
    private entityResolverService: EntityResolverService,
    @service(ContentService) private contentService: ContentService,
  ) {}

  @post('/tenant/{tenantUUID}/items/{itemUUID}/upload-session', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'createUploadSession',
    responses: {
      '201': {
        description: 'Create an upload session on the specified node',
        content: {
          'application/json': {
            schema: getModelSchemaRef(CreateUploadSessionResponse, {
              title: 'CreateUploadSessionResponse',
            }),
          },
        },
      },
    },
  })
  async createUploadSession(
    @param.path.string('tenantUUID') tenantUUID: string,
    @param.path.string('itemUUID') itemUUID: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(CreateUploadSessionRequest, {
            title: 'CreateUploadSessionRequest',
          }),
        },
      },
    })
    request: CreateUploadSessionRequest,
  ): Promise<CreateUploadSessionResponse> {
    const resolved = await this.entityResolverService.resolveNode(
      tenantUUID,
      itemUUID,
      undefined,
      Security.Permissions.WRITE,
    );

    const created = await this.uploadService.createUploadSession(
      resolved.node,
      request,
    );

    this.response.status(201);
    return created;
  }

  @post('/upload-sessions/{sessionUUID}/part', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'uploadPartialContent',
    responses: {
      204: {
        description: 'Uploaded partial content',
      },
    },
  })
  async uploadPartialContent(
    @param.path.string('sessionUUID') sessionUUID: string,
    @requestBody(OAS_CONTENT_PART_UPLOAD_SPEC)
    request: RawUploadDto,
  ): Promise<void> {
    try {
      if (!request) {
        throw new HttpErrors.BadRequest();
      }
      const resolved = await this.entityResolverService.resolveUploadSession(
        sessionUUID,
        Security.Permissions.WRITE,
      );

      await this.uploadService.processUploadedPart(
        this.req,
        resolved.session.uuid,
        request,
      );

      this.response.status(204);
    } finally {
      await this.contentService.cleanup(request);
    }
  }

  @post('/upload-sessions/{sessionUUID}/finalize', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'finalizeUploadSession',
    responses: {
      '201': {
        description: 'Created content instance',
        content: {
          'application/json': {
            schema: getModelSchemaRef(CreateContentResponse, {
              title: 'CreateContentResponse',
            }),
          },
        },
      },
    },
  })
  async finalizeUploadSession(
    @param.path.string('sessionUUID') sessionUUID: string,
  ): Promise<CreateContentResponse> {
    const resolved = await this.entityResolverService.resolveUploadSession(
      sessionUUID,
      Security.Permissions.WRITE,
    );

    const ret = await this.uploadService.finalizeUploadSession(
      resolved.session.uuid,
    );
    this.response.status(201);
    return ret;
  }

  @del('/upload-sessions/{sessionUUID}', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'abortUploadSession',
    responses: {
      '204': {
        description: 'No content',
      },
    },
  })
  async abortUploadSession(
    @param.path.string('sessionUUID') sessionUUID: string,
  ): Promise<void> {
    const resolved = await this.entityResolverService.resolveUploadSession(
      sessionUUID,
      Security.Permissions.WRITE,
    );

    await this.uploadService.abortUploadSession(resolved.session.uuid);
  }
}
