import {inject, injectable} from '@loopback/core';
import {repository} from '@loopback/repository';
import {ConfigurationBindings} from '../../key';
import {ClientTenantBackbone, FilesystemBackboneTenant} from '../../models';
import {FilesystemBackboneTenantRepository} from '../../repositories';
import {AppCustomConfig} from '../../utils/configuration-utils';
import {AbstractBackboneManagerService} from '../content/abstract-backbone-manager.service';

@injectable()
export class FilesystemBackboneManager
  implements AbstractBackboneManagerService<FilesystemBackboneTenant>
{
  constructor(
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
    @repository(FilesystemBackboneTenantRepository)
    private fsBackboneTenantRepository: FilesystemBackboneTenantRepository,
  ) {}

  public get typeCode(): string {
    return ClientTenantBackbone.FILESYSTEM;
  }

  public get enabled(): boolean {
    return !!this.configuration.filesystem.enable;
  }

  public async findById(
    id: number,
  ): Promise<FilesystemBackboneTenant | undefined> {
    return this.fsBackboneTenantRepository.findById(id);
  }

  public async list(): Promise<FilesystemBackboneTenant[]> {
    const tenantEntities = await this.fsBackboneTenantRepository.find();
    const output: FilesystemBackboneTenant[] = [];

    for (const entity of tenantEntities) {
      output.push(entity);
    }

    return output;
  }
}
