import {securityId} from '@loopback/security';
import * as jwt from 'jsonwebtoken';
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
    [securityId]: id + '',
    authenticationMethod: Security.AuthenticationMethod.TOKEN,
    code: 'client' + id,
    name: 'Test Client ' + id,
    id,
    groups: [],
    scopes: [
      Security.SCOPES.DOC_USAGE,
      ...(platformAdmin ? [Security.SCOPES.PLATFORM_ADMIN] : []),
    ],
  };

  const token = jwt.sign(profile, testConfig.security.tokenSecret, {
    issuer: testConfig.security.tokenIssuer,
  });

  const wrongToken = jwt.sign(
    profile,
    testConfig.security.tokenSecret + 'aef0',
    {
      issuer: testConfig.security.tokenIssuer,
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
