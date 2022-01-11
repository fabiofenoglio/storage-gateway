/* eslint-disable @typescript-eslint/no-explicit-any */
import {inject} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {
  HttpErrors,
  Request
} from '@loopback/rest';
import * as jwt from 'jsonwebtoken';
import {
  ConfigurationBindings,
  LoggerBindings
} from '../key';
import {
  TokenClientAuthenticationStrategyCredentials
} from '../security/security-constants';
import {AppCustomSecurityConfig} from '../utils/configuration-utils';
import {ObjectUtils} from '../utils/object-utils';



export interface AuthenticationTokenPayload {
  id: number;
  name: string;
  code: string;
  groups: string[];
  scopes: string[];
  channel?: string;
}

export interface SignedAuthenticationTokenPayload
  extends AuthenticationTokenPayload {
  iat: number;
  iss: string;
  sub: string;
  jti: string;
  exp: number;
}

export class TokenAuthenticationClientService {
  constructor(
    @inject(LoggerBindings.SECURITY_LOGGER) private logger: WinstonLogger,
    @inject(ConfigurationBindings.SECURITY_CONFIG)
    private securityConfig: AppCustomSecurityConfig,
  ) {}

  async verifyCredentials(
    credentials: TokenClientAuthenticationStrategyCredentials,
  ): Promise<SignedAuthenticationTokenPayload> {
    if (!credentials || !credentials.token) {
      throw new HttpErrors.Unauthorized(`Missing credentials`);
    }

    const secret = this.resolveSecret();

    let verified: any;

    try {
      verified = jwt.verify(credentials.token, secret, {
        complete: true,
        issuer: this.securityConfig.tokenIssuer,
        algorithms: [this.securityConfig.algorithm],
      });
    } catch (err) {
      console.error('token verification failed:', err);
      throw new HttpErrors.Unauthorized(`Token verification failed`);
    }

    this.logger.debug('decoded and verified jwt token', verified);

    const parsed = verified.payload as SignedAuthenticationTokenPayload;

    if (this.logger.isDebugEnabled()) {
      this.logger.debug('parsed issuedAt = ' + parsed.iat);
      this.logger.debug('parsed expiresAt = ' + parsed.exp);
      this.logger.debug('parsed issuer = ' + parsed.iss);
      this.logger.debug('parsed subject = ' + parsed.sub);
      this.logger.debug('parsed tokenId = ' + parsed.jti);
    }

    return parsed;
  }

  extractCredentials(
    request: Request,
  ): TokenClientAuthenticationStrategyCredentials | null {
    if (!request.headers.authorization) {
      return null;
    }

    // for example : Bearer AAA.BBB.CCC
    const authHeaderValue = request.headers.authorization;

    if (!authHeaderValue.startsWith('Bearer')) {
      throw new HttpErrors.Unauthorized(
        `Malformed or unsupported authentication header.`,
      );
    }

    //split the string into 2 parts. We are interested in the base64 portion
    const parts = authHeaderValue.split(' ');
    if (parts.length !== 2)
      throw new HttpErrors.Unauthorized(
        `Malformed or unsupported authentication header.`,
      );
    const providedToken = parts[1];

    //split the string into 2 parts
    const decryptedParts = providedToken.split('.');

    if (
      decryptedParts.length !== 3 ||
      decryptedParts[0].length < 1 ||
      decryptedParts[1].length < 1 ||
      decryptedParts[2].length < 1
    ) {
      throw new HttpErrors.Unauthorized(
        `Malformed or unsupported authentication header.`,
      );
    }

    const creds: TokenClientAuthenticationStrategyCredentials = {
      token: providedToken,
    };

    return creds;
  }

  resolveSecret(): string {
    const config = ObjectUtils.require(this.securityConfig, 'tokenSecret');
    return config.trim();
  }
}
