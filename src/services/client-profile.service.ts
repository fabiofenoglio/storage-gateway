import {injectable} from '@loopback/core';
import {securityId} from '@loopback/security';

import {
  ClientAuthenticationRequirements,
  Security,
} from '../security/security-constants';
import {SignedAuthenticationTokenPayload} from './token-client-auth.service';

export interface ClientAuthorizations {
  scopes: string[];
}

export interface ClientProfile extends ClientAuthorizations {
  [securityId]: string;
  code: string;
  authenticationMethod?: Security.AuthenticationMethod;
}

export const SystemClient: ClientProfile = {
  [securityId]: 'system',
  code: 'system',
  scopes: [],
};

@injectable()
export class ClientProfileService {
  constructor() {}

  public async profileFromToken(
    payload: SignedAuthenticationTokenPayload,
  ): Promise<ClientProfile> {
    const scopes: string[] = [];
    if (payload.scope?.length) {
      scopes.push(...payload.scope.split(' '));
    }

    const output: ClientProfile = {
      [securityId]: payload.sub.toString(),
      scopes: scopes,
      code: payload.sub,
      authenticationMethod: Security.AuthenticationMethod.TOKEN,
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
