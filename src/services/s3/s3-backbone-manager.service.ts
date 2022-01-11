/* eslint-disable @typescript-eslint/no-explicit-any */
import {inject, injectable} from '@loopback/core';
import {repository} from '@loopback/repository';
import {ConfigurationBindings} from '../../key';
import {ClientTenantBackbone, S3BackboneTenant} from '../../models';
import {
  PaginationRepository,
  S3BackboneTenantRepository,
} from '../../repositories';
import {AppCustomConfig} from '../../utils';
import {AbstractBackboneManagerService} from '../content/abstract-backbone-manager.service';

@injectable()
export class S3BackboneManager extends AbstractBackboneManagerService<S3BackboneTenant> {
  constructor(
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
    @repository(S3BackboneTenantRepository)
    private s3BackboneTenantRepository: S3BackboneTenantRepository,
  ) {
    super();
  }

  public get typeCode(): string {
    return ClientTenantBackbone.S3;
  }

  public get enabled(): boolean {
    return !!this.configuration.s3.enable;
  }

  public async findById(id: number): Promise<S3BackboneTenant | undefined> {
    return this.getRepository().findById(id);
  }

  public async list(): Promise<S3BackboneTenant[]> {
    const tenantEntities = await this.getRepository().find();
    const output: S3BackboneTenant[] = [];

    for (const entity of tenantEntities) {
      output.push(entity);
    }

    return output;
  }

  protected getRepository(): PaginationRepository<
    S3BackboneTenant,
    number,
    any
  > {
    return this.s3BackboneTenantRepository;
  }
}
