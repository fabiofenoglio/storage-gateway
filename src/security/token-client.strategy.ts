import {
  asAuthStrategy,
  AuthenticationBindings,
  AuthenticationMetadata,
  AuthenticationStrategy,
} from '@loopback/authentication';
import {Getter, inject, injectable, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {
  asSpecEnhancer,
  HttpErrors,
  mergeSecuritySchemeToSpec,
  OASEnhancer,
  OpenApiSpec,
  Request,
} from '@loopback/rest';
import {
  ConfigurationBindings,
  LoggerBindings,
  TokenClientAuthenticationStrategyBindings,
} from '../key';
import {
  ClientProfile,
  ClientProfileService,
} from '../services/client-profile.service';
import {TokenAuthenticationClientService} from '../services/token-client-auth.service';
import {AppCustomSecurityConfig} from '../utils/configuration-utils';
import {
  ClientAuthenticationRequirements,
  TokenClientAuthenticationStrategyCredentials,
} from './security-constants';

@injectable(asAuthStrategy, asSpecEnhancer)
export class TokenClientAuthenticationStrategy
  implements AuthenticationStrategy, OASEnhancer
{
  name = 'token';

  @inject(TokenClientAuthenticationStrategyBindings.DEFAULT_OPTIONS)
  options: ClientAuthenticationRequirements;

  constructor(
    @inject(LoggerBindings.SECURITY_LOGGER) private logger: WinstonLogger,

    @inject(TokenClientAuthenticationStrategyBindings.CLIENT_SERVICE)
    private clientService: TokenAuthenticationClientService,

    @service(ClientProfileService)
    public clientProfileService: ClientProfileService,

    @inject.getter(AuthenticationBindings.METADATA)
    readonly getMetaData: Getter<AuthenticationMetadata[]>,

    @inject(ConfigurationBindings.SECURITY_CONFIG)
    private securityConfig: AppCustomSecurityConfig,
  ) {}

  async authenticate(request: Request): Promise<ClientProfile | undefined> {
    await this.processOptions();

    const credentials: TokenClientAuthenticationStrategyCredentials | null =
      this.clientService.extractCredentials(request);

    if (!credentials) {
      throw new HttpErrors.Unauthorized(`Authorization header not found.`);
    }

    this.logger.debug('provided credentials', credentials);

    const verifiedPayload = await this.clientService.verifyCredentials(
      credentials,
    );

    const profile = await this.clientProfileService.profileFromToken(
      verifiedPayload,
    );

    this.logger.debug('profiled user', profile);

    if (!(await this.clientProfileService.authorize(profile, this.options))) {
      throw new HttpErrors.Forbidden(`Not allowed.`);
    }

    return profile;
  }

  async processOptions() {
    const controllerMethodAuthenticationMetadata = await this.getMetaData();

    if (!this.options) {
      this.options = {
        context: 'on-the-fly',
      };
    }

    //override default options with request-level options
    if (controllerMethodAuthenticationMetadata.length) {
      this.options = Object.assign(
        {},
        this.options,
        controllerMethodAuthenticationMetadata[0].options,
      );
    }
  }

  modifySpec(spec: OpenApiSpec): OpenApiSpec {
    return mergeSecuritySchemeToSpec(spec, this.name, {
      type: 'http',
      scheme: 'bearer',
    });
  }
}
