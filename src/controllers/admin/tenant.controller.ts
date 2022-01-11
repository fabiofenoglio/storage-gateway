import {authenticate} from '@loopback/authentication';
import {service} from '@loopback/core';
import {get, getModelSchemaRef, param} from '@loopback/rest';
import {BackboneResumeDto} from '../../rest/dto/backbone-resume-dto.model';
import {ListTenantsResponse} from '../../rest/list-tenant/list-tenants-response.model';
import {Security} from '../../security';
import {BackboneService} from '../../services/backbone.service';
import {ClientTenantService} from '../../services/client-tenant.service';
import {PaginationUtils} from '../../utils/pagination-utils';

@authenticate({
  strategy: 'token',
  options: {required: Security.SCOPES.PLATFORM_ADMIN},
})
export class TenantAdminController {
  constructor(
    @service(BackboneService) private backboneService: BackboneService,
    @service(ClientTenantService)
    private clientTenantService: ClientTenantService,
  ) {}

  @get('/admin/backbone', {
    responses: {
      '200': {
        description: 'List of configured backbones',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: getModelSchemaRef(BackboneResumeDto),
            },
          },
        },
      },
    },
  })
  async listBackbones(): Promise<BackboneResumeDto[]> {
    return this.backboneService.list();
  }

  @get('/admin/tenant', {
    responses: {
      '200': {
        description: 'List of configured tenants',
        content: {
          'application/json': {
            schema: getModelSchemaRef(ListTenantsResponse, {
              title: 'ListTenantsResponse',
            }),
          },
        },
      },
    },
  })
  async listTenants(
    @param.query.number('page', {required: false}) page?: number,
    @param.query.number('size', {required: false}) size?: number,
  ): Promise<ListTenantsResponse> {
    const tenants = await this.clientTenantService.list(
      PaginationUtils.parsePagination(page, size),
    );
    return tenants;
  }
}
