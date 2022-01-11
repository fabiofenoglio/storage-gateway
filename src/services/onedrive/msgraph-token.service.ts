/* eslint-disable @typescript-eslint/no-explicit-any */
import {BindingScope, inject, injectable} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {
  AuthenticationProvider,
  Client,
} from '@microsoft/microsoft-graph-client';
import * as MicrosoftGraph from '@microsoft/microsoft-graph-types';
import fetch from 'isomorphic-fetch';
import {v4 as uuidv4} from 'uuid';
import {ClientProfile} from '..';
import {ConfigurationBindings, LoggerBindings} from '../../key';
import {MsGraphToken} from '../../models';
import {MsGraphErrorResponse} from '../../models/msgraph/authorization/error-response.model';
import {MsGraphTokenResponse} from '../../models/msgraph/token-response.model';
import {MsGraphTokenRepository} from '../../repositories';
import {
  AppCustomConfig,
  AppCustomOnedriveConfig,
} from '../../utils/configuration-utils';

@injectable({
  scope: BindingScope.SINGLETON,
})
export class MsGraphTokenService {
  private AUTHORIZATION_CODE_ENDPOINT =
    'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';

  private AUTHORIZATION_TOKEN_ENDPOINT =
    'https://login.microsoftonline.com/common/oauth2/v2.0/token';

  private TOKEN_REFRESH_ENDPOINT =
    'https://login.microsoftonline.com/common/oauth2/v2.0/token';

  private MINIMUM_TOKEN_TTL = 180;

  private authenticationProvider: {[key: string]: AuthenticationProvider} = {};

  private preAuthorizations: {[key: string]: PreAuthorizationToken} = {};

  constructor(
    @inject(LoggerBindings.SECURITY_LOGGER) private logger: WinstonLogger,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
    @repository(MsGraphTokenRepository)
    private msGraphTokenRepository: MsGraphTokenRepository,
  ) {}

  public get config(): AppCustomOnedriveConfig {
    return this.configuration?.onedrive;
  }

  private get clientId(): string {
    return this.configuration.onedrive.applicationClientId;
  }

  private get clientSecret(): string {
    return this.configuration.onedrive.applicationClientSecret;
  }

  private get redirectUri(): string {
    return this.configuration.onedrive.applicationRedirectUrl;
  }

  private get scopes(): string[] {
    return this.configuration.onedrive.applicationRequiredScopes ?? [];
  }

  public buildClientForUserId(principalId: string): Client {
    if (!principalId) {
      throw new Error('PrincipalId is required');
    }

    const options = {
      authProvider: this.getAuthenticationProvider(principalId),
    };
    const client = Client.initWithMiddleware(options);
    return client;
  }

  private buildClient(authProvider: AuthenticationProvider): Client {
    const options = {
      authProvider,
    };
    const client = Client.initWithMiddleware(options);
    return client;
  }

  public getAuthenticationProvider(
    principalId: string,
  ): AuthenticationProvider {
    if (!principalId) {
      throw new Error('PrincipalId is required');
    }
    if (!this.authenticationProvider[principalId]) {
      this.authenticationProvider[principalId] =
        this.buildAuthenticationProvider(principalId);
    }
    return this.authenticationProvider[principalId];
  }

  private buildAuthenticationProvider(
    principalId: string,
  ): AuthenticationProvider {
    if (!principalId) {
      throw new Error('PrincipalId is required');
    }
    return {
      getAccessToken: async () => {
        const token = await this.requireActive(principalId);
        return token.accessToken;
      },
    };
  }

  private async findTokenForPrincipal(
    principalId: string,
  ): Promise<MsGraphToken | undefined> {
    if (!principalId) {
      throw new Error('Unspecified required user principal');
    }

    this.logger.debug('finding access token for principal ' + principalId);

    const findResult = (
      await this.msGraphTokenRepository.find({
        where: {
          userPrincipalId: principalId,
        },
        order: ['id ASC'],
      })
    ).filter(candidate => !!candidate.accessToken);

    if (!findResult.length) {
      return undefined;
    } else if (findResult.length > 1) {
      throw new Error('Undetermined access token for required principal');
    } else {
      return findResult[0];
    }
  }

  private async requireActive(principalId: string): Promise<MsGraphToken> {
    const raw = await this.findTokenForPrincipal(principalId);
    if (!raw) {
      throw new HttpErrors.ServiceUnavailable('Missing access token');
    }
    const token = await this.refreshIfNeeded(raw);
    return token;
  }

  public getAuthorizationUrl(client: ClientProfile): string {
    let url =
      this.AUTHORIZATION_CODE_ENDPOINT +
      '?client_id=' +
      encodeURIComponent(this.clientId);

    const scopes = this.scopes;
    if (scopes?.length) {
      url += '&scope=' + encodeURIComponent(scopes.join(' '));
    }

    const preAuth: PreAuthorizationToken = {
      clientCode: client.code,
      token: uuidv4(),
    };
    this.preAuthorizations[preAuth.clientCode] = preAuth;

    this.logger.debug('generated preauthorization', preAuth);

    url +=
      '&response_type=code&redirect_uri=' +
      encodeURIComponent(this.redirectUri);
    url += '&state=' + encodeURIComponent(JSON.stringify(preAuth));
    return url;
  }

  private validatePreauthorization(payload: string): PreAuthorizationToken {
    if (!payload?.length) {
      throw new HttpErrors.BadRequest('Missing preauthorization');
    }
    const input: PreAuthorizationToken = JSON.parse(payload);

    this.logger.debug('provided callback preauthorization', input);

    if (!input.clientCode || !input.token) {
      throw new HttpErrors.BadRequest('Invalid preauthorization content');
    }
    const local = this.preAuthorizations[input.clientCode];
    if (!local) {
      throw new HttpErrors.BadRequest('Unrecognized preauthorization content');
    }
    if (local.token !== input.token) {
      throw new HttpErrors.BadRequest('Invalid preauthorization token');
    }
    return local;
  }

  public async redeem(code: string, state: string): Promise<MsGraphToken> {
    const url = this.AUTHORIZATION_TOKEN_ENDPOINT;

    const preAuthorization = this.validatePreauthorization(state);
    delete this.preAuthorizations[preAuthorization.clientCode];

    this.logger.debug(
      'matched and verified preauthorization',
      preAuthorization,
    );

    const headers = {
      ...this.getHeaders(),
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    const payload: any = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      client_id: this.clientId,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      redirect_uri: this.redirectUri,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      client_secret: this.clientSecret,
      code: code,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      grant_type: 'authorization_code',
    };

    this.logger.debug('redeeming with payload', payload);

    const encodedPayload = Object.keys(payload)
      .map(key => {
        return encodeURIComponent(key) + '=' + encodeURIComponent(payload[key]);
      })
      .join('&');

    this.logger.debug('redeeming with encoded payload', encodedPayload);

    const requestedAt = new Date();
    const response = await this.fetch<any>(url, {
      method: 'POST',
      headers,
      body: encodedPayload,
    });
    const issuedAt = new Date();

    this.logger.debug('redeem raw output', response);

    if (response instanceof MsGraphErrorResponse) {
      throw new HttpErrors.BadRequest(
        'Redeem failed: ' + response.errorDescription,
      );
    }

    const mapped = new MsGraphTokenResponse(response);

    this.logger.debug('redeem mapped output', mapped);

    const expiresAt = new Date(requestedAt.getTime() + mapped.expiresIn * 1000);

    // test if working
    const testResult = await this.testAccessToken(mapped.accessToken);

    let entity = new MsGraphToken({
      tokenType: mapped.tokenType,
      scope: (mapped.scope ?? []).join(' '),
      accessToken: mapped.accessToken,
      refreshToken: mapped.refreshToken,
      expiresIn: mapped.expiresIn,
      extExpiresIn: mapped.extExpiresIn,
      issuedAt: issuedAt,
      requestedAt: requestedAt,
      expiresAt: expiresAt,
      userPrincipalName: testResult.userPrincipalName ?? undefined,
      userPrincipalId: testResult.id ?? undefined,
      associatedClient: preAuthorization.clientCode,
    });

    this.logger.debug('persisting entity', entity);

    entity = await this.msGraphTokenRepository.create(entity);

    this.logger.debug('persisted entity', entity);

    return entity;
  }

  private async testAccessToken(token: string): Promise<MicrosoftGraph.User> {
    const oneShotClient = this.buildClient({
      getAccessToken: async () => {
        return token;
      },
    });

    const out: MicrosoftGraph.User = await oneShotClient.api('/me').get();

    if (!out || !out.userPrincipalName) {
      throw new Error('Missing principal name on provided token');
    }

    this.logger.debug(
      'validated token for principal ' +
        out.userPrincipalName +
        ' - ' +
        out.displayName,
    );

    return out;
  }

  private async fetch<T>(
    url: string,
    options: RequestInit,
  ): Promise<T | MsGraphErrorResponse> {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        ...this.getHeaders(),
      },
      ...options,
    });

    if (!response || response.status < 200) {
      throw new Error('Invalid fetch response');
    }

    const output = await response.json();

    if (response.status >= 400) {
      console.error(
        'error response from fetch call - status ' +
          response.status +
          ' - ' +
          response.statusText,
      );

      return new MsGraphErrorResponse({
        ...output,
      });
    }

    return output as T;
  }

  private getHeaders(): {[key: string]: string} {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  public async check(): Promise<any> {
    return {
      now: new Date().getTime(),
    };
  }

  private async refreshIfNeeded(token: MsGraphToken): Promise<MsGraphToken> {
    const ttl = this.getTTL(token);
    if (ttl !== null && ttl < this.MINIMUM_TOKEN_TTL) {
      this.logger.verbose('refreshing token because of expiration or low TTL');
      token = await this.refreshToken(token);
    }
    return token;
  }

  private getTTL(token: MsGraphToken): number | null {
    if (!token.expiresAt) {
      return null;
    }

    let ttl =
      (new Date(token.expiresAt).getTime() - new Date().getTime()) / 1000;
    if (ttl < 0) {
      ttl = 0;
    }
    return ttl;
  }

  private async refreshToken(entity: MsGraphToken): Promise<MsGraphToken> {
    const url = this.TOKEN_REFRESH_ENDPOINT;

    const headers = {
      ...this.getHeaders(),
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    const payload: any = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      client_id: this.clientId,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      redirect_uri: this.redirectUri,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      client_secret: this.clientSecret,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      refresh_token: entity.refreshToken,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      grant_type: 'refresh_token',
    };

    this.logger.debug('refreshing with payload', payload);

    const encodedPayload = Object.keys(payload)
      .map(key => {
        return encodeURIComponent(key) + '=' + encodeURIComponent(payload[key]);
      })
      .join('&');

    this.logger.debug('refreshing with encoded payload', encodedPayload);

    const requestedAt = new Date();
    const response = await this.fetch<any>(url, {
      method: 'POST',
      headers,
      body: encodedPayload,
    });
    const issuedAt = new Date();

    this.logger.debug('refreshing raw output', response);

    if (response instanceof MsGraphErrorResponse) {
      throw new HttpErrors.BadRequest(
        'Token refresh failed: ' + response.errorDescription,
      );
    }

    const mapped = new MsGraphTokenResponse(response);

    this.logger.debug('refreshing mapped output', mapped);

    const expiresAt = new Date(requestedAt.getTime() + mapped.expiresIn * 1000);

    this.logger.debug('existing entity', entity);

    entity.accessToken = mapped.accessToken;
    entity.refreshToken = mapped.refreshToken;
    entity.expiresIn = mapped.expiresIn;
    entity.extExpiresIn = mapped.extExpiresIn;
    entity.refreshRequestedAt = requestedAt;
    entity.refreshedAt = issuedAt;
    entity.expiresAt = expiresAt;

    this.logger.debug('updating entity', entity);

    await this.msGraphTokenRepository.update(entity);
    return entity;
  }
}

interface PreAuthorizationToken {
  clientCode: string;
  token: string;
}
