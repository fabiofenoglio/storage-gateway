import {BindingScope, inject, injectable, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {ConfigurationBindings, LoggerBindings} from '../key';
import {AbstractBackbone} from '../models/proto/abstract-backbone.model';
import {BackboneResumeDto} from '../rest/dto/backbone-resume-dto.model';
import {AppCustomConfig} from '../utils/configuration-utils';
import {AbstractBackboneManagerService} from './content/abstract-backbone-manager.service';
import {FilesystemBackboneManager} from './filesystem/filesystem-backbone-manager.service';
import {MemoryBackboneManager} from './in-memory/memory-backbone-manager.service';
import {OnedriveBackboneManager} from './onedrive/onedrive-backbone-manager.service';
import {S3BackboneManager} from './s3/s3-backbone-manager.service';

@injectable({scope: BindingScope.SINGLETON})
export class BackboneService {
  private registeredManagers: {
    [typeCode: string]: AbstractBackboneManagerService<AbstractBackbone>;
  } = {};

  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER) private logger: WinstonLogger,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
    @service(OnedriveBackboneManager)
    private onedriveBackboneManager: OnedriveBackboneManager,
    @service(FilesystemBackboneManager)
    private filesystemBackboneManager: FilesystemBackboneManager,
    @service(MemoryBackboneManager)
    private memoryBackboneManager: MemoryBackboneManager,
    @service(S3BackboneManager)
    private s3BackboneManager: S3BackboneManager,
  ) {
    [
      onedriveBackboneManager,
      filesystemBackboneManager,
      memoryBackboneManager,
      s3BackboneManager,
    ].forEach(manager => {
      if (manager.enabled) {
        this.registeredManagers[manager.typeCode] = manager;
        this.logger.debug(
          'registering backbone manager for class ' + manager.typeCode,
        );
      } else {
        this.logger.debug(
          'skipping backbone manager registration for class ' +
            manager.typeCode +
            ' as it is disabled',
        );
      }
    });
  }

  public getTypeManager(
    code: string,
  ): AbstractBackboneManagerService<AbstractBackbone> {
    if (!code) {
      throw new Error('Code is required');
    }

    const registered = this.registeredManagers[code];
    if (!registered) {
      throw new Error('No backbone manager found for type ' + code);
    }
    return registered;
  }

  public async list(): Promise<BackboneResumeDto[]> {
    const output: BackboneResumeDto[] = [];
    for (const manager of Object.values(this.registeredManagers)) {
      const listed = await manager.list();

      listed.forEach(item =>
        output.push(
          new BackboneResumeDto({
            ...item,
          }),
        ),
      );
    }
    return output;
  }
}
