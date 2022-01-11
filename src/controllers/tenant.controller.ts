import {authenticate} from '@loopback/authentication';
import {service} from '@loopback/core';
import {get, getModelSchemaRef, param} from '@loopback/rest';
import {GetTenantResponse} from '../rest/get-tenant/get-tenant-response.model';
import {Security} from '../security';
import {EntityResolverService} from '../services';
import {ClientTenantService} from '../services/client-tenant.service';

const OAS_CONTROLLER_NAME = 'Tenant';

@authenticate({
  strategy: 'token',
  options: {required: Security.SCOPES.DOC_USAGE},
})
export class TenantController {
  constructor(
    @service(ClientTenantService)
    private clientTenantService: ClientTenantService,
    @service(EntityResolverService)
    private entityResolverService: EntityResolverService,
  ) {}

  @get('/tenant/{tenantUUID}', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'getTenant',
    responses: {
      '200': {
        description: 'Configuration of specified tenant',
        content: {
          'application/json': {
            schema: getModelSchemaRef(GetTenantResponse, {
              title: 'GetTenantResponse',
            }),
          },
        },
      },
    },
  })
  async getTenant(
    @param.path.string('tenantUUID') tenantUUID: string,
  ): Promise<GetTenantResponse> {
    const resolved = await this.entityResolverService.resolveTenant(
      tenantUUID,
      Security.Permissions.READ,
    );
    const response = await this.clientTenantService.getTenant(resolved.code);

    return response.dto;
  }
}
