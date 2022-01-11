import {AbstractBackbone} from '../proto';

export abstract class ProtoS3BackboneTenant extends AbstractBackbone {
  constructor(data?: Partial<ProtoS3BackboneTenant>) {
    super(data);
  }
}

export interface ProtoS3BackboneTenantRelations {
  // describe navigational properties here
}

export type ProtoS3BackboneTenantWithRelations = ProtoS3BackboneTenant &
  ProtoS3BackboneTenantRelations;
