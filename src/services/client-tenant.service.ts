import {inject, injectable, service} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {ConfigurationBindings} from '../key';
import {ClientTenant, Pageable} from '../models';
import {ClientTenantRepository} from '../repositories';
import {TenantResumeDto} from '../rest';
import {BackboneResumeDto} from '../rest/dto/backbone-resume-dto.model';
import {GetTenantResponse} from '../rest/get-tenant/get-tenant-response.model';
import {ListTenantsResponse} from '../rest/list-tenant/list-tenants-response.model';
import {SanitizationUtils} from '../utils';
import {AppCustomConfig} from '../utils/configuration-utils';
import {BackboneService} from './backbone.service';

@injectable()
export class ClientTenantService {
  constructor(
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
    @service(BackboneService) private backboneService: BackboneService,
    @repository(ClientTenantRepository)
    private clientTenantRepository: ClientTenantRepository,
  ) {}

  public async fetchById(id: number): Promise<ClientTenant> {
    if (!id) {
      throw new HttpErrors.BadRequest();
    }
    const entity = await this.clientTenantRepository.findOne({
      where: {
        id,
      },
    });

    if (!entity) {
      throw new HttpErrors.NotFound();
    }
    return entity;
  }

  public async fetch(uuid: string): Promise<ClientTenant> {
    uuid = SanitizationUtils.sanitizeTenantCode(uuid);
    if (!uuid) {
      throw new HttpErrors.BadRequest();
    }
    const entity = await this.clientTenantRepository.findOne({
      where: {
        code: uuid,
      },
    });

    if (!entity) {
      throw new HttpErrors.NotFound();
    }
    return entity;
  }

  public async getTenant(
    uuid: string,
  ): Promise<{dto: GetTenantResponse; entity: ClientTenant}> {
    uuid = SanitizationUtils.sanitizeTenantCode(uuid);
    if (!uuid) {
      throw new HttpErrors.BadRequest();
    }

    const entity = await this.fetch(uuid);
    const backbone = await this.backboneService
      .getTypeManager(entity.backboneType)
      .findById(entity.backboneId);

    // TODO extract to mapper service
    return {
      dto: new GetTenantResponse({
        ...entity,
        backbone: new BackboneResumeDto(backbone),
      }),
      entity,
    };
  }

  public async list(pageable: Pageable): Promise<ListTenantsResponse> {
    const tenantEntities = await this.clientTenantRepository.findPage(
      {
        order: ['code ASC'],
      },
      pageable,
    );
    const output: TenantResumeDto[] = [];

    // TODO extract to mapper service
    for (const entity of tenantEntities.content) {
      const backbone = await this.backboneService
        .getTypeManager(entity.backboneType)
        .findById(entity.backboneId);

      output.push(
        new TenantResumeDto({
          ...entity,
          backbone: new BackboneResumeDto(backbone),
        }),
      );
    }

    return new ListTenantsResponse({
      ...tenantEntities,
      content: output,
    });
  }
}
