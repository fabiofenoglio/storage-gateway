import * as jwt from 'jsonwebtoken';
import jwks from 'jwks-rsa';

/* eslint-disable @typescript-eslint/no-explicit-any */
import {inject} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {HttpErrors, Request} from '@loopback/rest';

import {ConfigurationBindings, LoggerBindings} from '../key';
import {TokenClientAuthenticationStrategyCredentials} from '../security/security-constants';
import {AppCustomSecurityConfig} from '../utils/configuration-utils';

export interface SignedAuthenticationTokenPayload {
  iat: number;
  iss: string;
  sub: string;
  jti: string;
  exp: number;
  scope: string;
  gty: string;
}

export class TokenAuthenticationClientService {
  jwksClient?: jwks.JwksClient;

  constructor(
    @inject(LoggerBindings.SECURITY_LOGGER) private logger: WinstonLogger,
    @inject(ConfigurationBindings.SECURITY_CONFIG)
    private securityConfig: AppCustomSecurityConfig,
  ) {
    if (
      !!securityConfig.tokenJwksUri === !!securityConfig.tokenSecret?.length
    ) {
      throw new Error(
        'exactly one of tokenJwksUri and tokenSecret must be provided',
      );
    }

    if (securityConfig.tokenJwksUri) {
      this.jwksClient = jwks({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: securityConfig.tokenJwksUri,
      });
    }
  }

  async verifyCredentials(
    credentials: TokenClientAuthenticationStrategyCredentials,
  ): Promise<SignedAuthenticationTokenPayload> {
    if (!credentials || !credentials.token) {
      throw new HttpErrors.Unauthorized(`Missing credentials`);
    }

    const signingKey = await this.resolveSigningKey(credentials.token);

    let verified: any;

    try {
      verified = jwt.verify(credentials.token, signingKey, {
        complete: true,
        algorithms: [this.securityConfig.algorithm],
        issuer: this.securityConfig.tokenIssuer,
        audience: this.securityConfig.tokenAudience,
      });
    } catch (err) {
      this.logger.error('token verification failed:', err);
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

  async resolveSigningKey(token: string): Promise<string> {
    if (this.jwksClient) {
      let decoded: jwt.Jwt;
      try {
        const decodedAttempt = jwt.decode(token, {complete: true});
        if (!decodedAttempt) {
          throw new Error('no token could be decoded');
        }
        decoded = decodedAttempt;
      } catch (err) {
        this.logger.error('token decoding failed:', err);
        throw new HttpErrors.Unauthorized(`Token decoding failed`);
      }

      if (!decoded.header.kid?.length) {
        this.logger.error('token decoding failed: missing key ID');
        throw new HttpErrors.Unauthorized(`Token decoding failed`);
      }

      const key = await this.jwksClient.getSigningKey(decoded.header.kid);
      if (!key) {
        this.logger.error('token decoding failed: missing key');
        throw new HttpErrors.Unauthorized(`Token decoding failed`);
      }

      const signingKey = key.getPublicKey();
      if (!signingKey?.length) {
        this.logger.error('token decoding failed: missing signingKey');
        throw new HttpErrors.Unauthorized(`Token decoding failed`);
      }
      return signingKey;
    } else if (this.securityConfig.tokenSecret?.length) {
      return this.securityConfig.tokenSecret;
    } else {
      throw new Error('no key could be resolved for signature verification');
    }
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
}
