import {injectable} from '@loopback/core';
import {securityId} from '@loopback/security';
import {
  ClientAuthenticationRequirements,
  Security,
} from '../security/security-constants';
import {AuthenticationTokenPayload} from './token-client-auth.service';

export interface ClientAuthorizations {
  groups: string[];
  scopes: string[];
}

export interface ClientProfile extends ClientAuthorizations {
  [securityId]: string;
  name: string;
  code: string;
  id: number;
  channel?: string;
  connectIp?: string;
  proxyIps?: string[];
  authenticationMethod?: Security.AuthenticationMethod;
}

export const SystemClient: ClientProfile = {
  [securityId]: '0',
  name: 'System',
  code: 'system',
  id: 0,
  groups: [],
  scopes: [],
};

@injectable()
export class ClientProfileService {
  constructor() {}

  public async profileFromToken(
    payload: AuthenticationTokenPayload,
  ): Promise<ClientProfile> {
    const output: ClientProfile = {
      groups: payload.groups ?? [],
      scopes: payload.scopes ?? [],
      [securityId]: payload.id.toString(),
      name: payload.name,
      code: payload.code,
      id: payload.id,
      authenticationMethod: Security.AuthenticationMethod.TOKEN,
      channel: payload.channel,
    };

    return output;
  }

  public async authorize(
    client: ClientProfile,
    requirements: ClientAuthenticationRequirements,
  ): Promise<boolean> {
    if (requirements.required?.length) {
      if (!client) {
        return false;
      }

      if (client.scopes.indexOf(requirements.required) === -1) {
        return false;
      }
    }

    return true;
  }
}
