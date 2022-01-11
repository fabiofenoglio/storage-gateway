import {model, property} from '@loopback/repository';
import {AbstractBackbone} from '../proto/abstract-backbone.model';

@model({
  name: 'doc_onedrive_backbone_tenant',
})
export class OnedriveBackboneTenant extends AbstractBackbone {
  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  ownerPrincipalId: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 255,
    },
  })
  driveId: string;

  @property({
    type: 'string',
    required: true,
    mysql: {
      dataType: 'varchar',
      dataLength: 2048,
    },
  })
  rootLocation: string;

  constructor(data?: Partial<OnedriveBackboneTenant>) {
    super(data);
  }
}

export interface OnedriveBackboneTenantRelations {
  // describe navigational properties here
}

export type OnedriveBackboneTenantWithRelations = OnedriveBackboneTenant &
  OnedriveBackboneTenantRelations;
