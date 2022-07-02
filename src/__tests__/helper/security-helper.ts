import * as jwt from 'jsonwebtoken';

import {securityId} from '@loopback/security';

import {Security} from '../../security/security-constants';
import {ClientProfile} from '../../services';
import {testConfig} from './test-helper';

export interface TestPrincipal {
  profile: ClientProfile;
  token: string;
  authHeaderName: string;
  authHeaderValue: string;
  wrongAuthHeaderValue: string;
}

export function givenPrincipal(id = 1, platformAdmin = false): TestPrincipal {
  const profile: ClientProfile = {
    [securityId]: 'client' + id,
    authenticationMethod: Security.AuthenticationMethod.TOKEN,
    code: 'client' + id,
    scopes: [
      Security.SCOPES.DOC_USAGE,
      ...(platformAdmin ? [Security.SCOPES.PLATFORM_ADMIN] : []),
    ],
  };

  const tokenPayload = {
    scope: profile.scopes.join(' '),
  };

  const token = jwt.sign(tokenPayload, testConfig.security.tokenSecret!, {
    subject: profile.code,
    issuer: testConfig.security.tokenIssuer,
    audience: testConfig.security.tokenAudience,
  });

  const wrongToken = jwt.sign(
    tokenPayload,
    testConfig.security.tokenSecret + 'aef0',
    {
      issuer: testConfig.security.tokenIssuer,
      audience: testConfig.security.tokenAudience,
    },
  );

  return {
    profile,
    token,
    authHeaderName: 'Authorization',
    authHeaderValue: 'Bearer ' + token,
    wrongAuthHeaderValue: wrongToken,
  };
}
