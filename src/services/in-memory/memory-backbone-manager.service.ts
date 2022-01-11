import {inject, injectable} from '@loopback/core';
import {ConfigurationBindings} from '../../key';
import {ClientTenantBackbone} from '../../models';
import {MemoryBackboneTenant} from '../../models/memory/memory-backbone-tenant.model';
import {AppCustomConfig} from '../../utils';
import {AbstractBackboneManagerService} from '../content/abstract-backbone-manager.service';

@injectable()
export class MemoryBackboneManager
  implements AbstractBackboneManagerService<MemoryBackboneTenant>
{
  inMemory: MemoryBackboneTenant[] = [];

  constructor(
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
  ) {}

  public get typeCode(): string {
    return ClientTenantBackbone.MEMORY;
  }

  public get enabled(): boolean {
    return !!this.configuration.memory.enable;
  }

  public async findById(id: number): Promise<MemoryBackboneTenant | undefined> {
    let found = this.inMemory.find(o => o.id === id);
    if (!found) {
      found = new MemoryBackboneTenant({
        id: id,
        name: 'In-Memory backbone #' + id,
      });
      this.inMemory.push(found);
    }

    return found;
  }

  public async list(): Promise<MemoryBackboneTenant[]> {
    return this.inMemory;
  }
}
