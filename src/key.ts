import {BindingKey} from '@loopback/core';
import {LoggingBindings, WinstonLogger} from '@loopback/logging';
import {ClientAuthenticationRequirements} from './security';
import {ErrorService, TokenAuthenticationClientService} from './services';
import {
  AppCustomConfig,
  AppCustomSecurityConfig,
} from './utils/configuration-utils';

export namespace TokenClientAuthenticationStrategyBindings {
  export const CLIENT_SERVICE =
    BindingKey.create<TokenAuthenticationClientService>(
      'services.authentication.token.client.service',
    );

  export const DEFAULT_OPTIONS =
    BindingKey.create<ClientAuthenticationRequirements>(
      'services.authentication.token.client.defaultoptions',
    );
}

export namespace ConfigurationBindings {
  export const ROOT_CONFIG = BindingKey.create<AppCustomConfig>(
    'ff.storagegateway.config.root',
  );
  export const SECURITY_CONFIG = BindingKey.create<AppCustomSecurityConfig>(
    'ff.storagegateway.config.security',
  );
}

export namespace LoggerBindings {
  export const ROOT_LOGGER = LoggingBindings.WINSTON_LOGGER;
  export const DATASOURCE_LOGGER = BindingKey.create<WinstonLogger>(
    'ff.storagegateway.logger.datasource',
  );
  export const SECURITY_LOGGER = BindingKey.create<WinstonLogger>(
    'ff.storagegateway.logger.security',
  );
  export const SERVICE_LOGGER = BindingKey.create<WinstonLogger>(
    'ff.storagegateway.logger.service',
  );
  export const ONEDRIVE_LOGGER = BindingKey.create<WinstonLogger>(
    'ff.storagegateway.logger.onedrive',
  );
  export const S3_LOGGER = BindingKey.create<WinstonLogger>(
    'ff.storagegateway.logger.s3',
  );
}

export namespace ErrorBindings {
  export const ERROR_SERVICE = BindingKey.create<ErrorService>(
    'ff.storagegateway.error.service',
  );
}
