import {inject, injectable, service} from '@loopback/core';
import {repository} from '@loopback/repository';
import {ConfigurationBindings} from '../../key';
import {ClientTenantBackbone, OnedriveBackboneTenant} from '../../models';
import {OnedriveBackboneTenantRepository} from '../../repositories';
import {AppCustomConfig} from '../../utils/configuration-utils';
import {AbstractBackboneManagerService} from '../content/abstract-backbone-manager.service';
import {MsGraphTokenService} from './msgraph-token.service';

@injectable()
export class OnedriveBackboneManager
  implements AbstractBackboneManagerService<OnedriveBackboneTenant>
{
  constructor(
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
    @service(MsGraphTokenService)
    private msGraphTokenService: MsGraphTokenService,
    @repository(OnedriveBackboneTenantRepository)
    private onedriveBackboneTenantRepository: OnedriveBackboneTenantRepository,
  ) {}

  public get typeCode(): string {
    return ClientTenantBackbone.ONEDRIVE;
  }

  public get enabled(): boolean {
    return !!this.configuration.onedrive.enable;
  }

  public async findById(
    id: number,
  ): Promise<OnedriveBackboneTenant | undefined> {
    return this.onedriveBackboneTenantRepository.findById(id);
  }

  public async list(): Promise<OnedriveBackboneTenant[]> {
    const tenantEntities = await this.onedriveBackboneTenantRepository.find();
    const output: OnedriveBackboneTenant[] = [];

    for (const entity of tenantEntities) {
      /*
      const client = this.msGraphTokenService
        .buildClientForUserId(entity.ownerPrincipalId);

      const rawRootItems =
        await client.api(
          '/me/drives/' + entity.driveId + '/root:' + entity.rootLocation + ':/children',
        )
          .top(2)
          .get() as any;

      const rootItems = new MsGraphPageResponse<MicrosoftGraph.DriveItem>(rawRootItems);
      */
      output.push(entity);
    }

    return output;
  }
}
