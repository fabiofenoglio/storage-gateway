/* eslint-disable @typescript-eslint/no-explicit-any */
import {inject, injectable, service} from '@loopback/core';
import {repository} from '@loopback/repository';
import * as MicrosoftGraph from '@microsoft/microsoft-graph-types';
import {ConfigurationBindings} from '../../key';
import {MsGraphPageResponse} from '../../models/msgraph/page-response.model';
import {OnedriveBackboneTenantRepository} from '../../repositories';
import {AppCustomConfig} from '../../utils/configuration-utils';
import {MsGraphTokenService} from './msgraph-token.service';

@injectable()
export class MsGraphTestService {
  constructor(
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
    @service(MsGraphTokenService)
    private msGraphTokenService: MsGraphTokenService,
    @repository(OnedriveBackboneTenantRepository)
    private onedriveBackboneTenantRepository: OnedriveBackboneTenantRepository,
  ) {}

  public async getTenants(): Promise<any> {
    const tenantEntities = await this.onedriveBackboneTenantRepository.find();
    const output: any[] = [];

    for (const entity of tenantEntities) {
      const client = this.msGraphTokenService.buildClientForUserId(
        entity.ownerPrincipalId,
      );

      const rawRootItems = await client
        .api(
          '/me/drives/' +
            entity.driveId +
            '/root:' +
            entity.rootLocation +
            ':/children',
        )
        .top(2)
        .get();

      const rootItems = new MsGraphPageResponse<MicrosoftGraph.DriveItem>(
        rawRootItems,
      );
      output.push({
        ...entity,
        rootItems,
      });
    }

    return output;
  }
}
