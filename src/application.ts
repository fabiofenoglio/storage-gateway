import {
  AuthenticationComponent,
  registerAuthenticationStrategy,
} from '@loopback/authentication';
import {BootMixin} from '@loopback/boot';
import {createBindingFromClass} from '@loopback/context';
import {CronComponent} from '@loopback/cron';
import {HealthComponent, HealthTags} from '@loopback/health';
import {
  format,
  LoggingBindings,
  LoggingComponent,
  WinstonTransports,
} from '@loopback/logging';
import {RepositoryMixin} from '@loopback/repository';
import {RestApplication, RestBindings} from '@loopback/rest';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import {ServiceMixin} from '@loopback/service-proxy';
import path from 'path';
import winston from 'winston';
import {FilesystemContentDeletionCronJob} from './cronjobs/fs-content-deletion.cronjob';
import {LogsCleanupCronJob} from './cronjobs/logs-cleanup.cronjob';
import {OnedriveContentDeletionCronJob} from './cronjobs/onedrive-content-deletion.cronjob';
import {S3ContentDeletionCronJob} from './cronjobs/s3-content-deletion.cronjob';
import {UploadFolderCleanupCronJob} from './cronjobs/upload-folder-cleanup.cronjob';
import {UploadSessionsCleanupCronJob} from './cronjobs/upload-sessions-cleanup.cronjob';
import {DBHealthCheckProvider} from './health/db.healthcheck';
import {
  ConfigurationBindings,
  ErrorBindings,
  LoggerBindings,
  TokenClientAuthenticationStrategyBindings,
} from './key';
import {TokenClientAuthenticationStrategy} from './security';
import {MySequence} from './sequence';
import {ErrorService, TokenAuthenticationClientService} from './services';
import {AppCustomConfig} from './utils/configuration-utils';
import {MultipartFormDataBodyParser} from './utils/multipart-parser';

export class StorageGatewayApplication extends BootMixin(
  ServiceMixin(RepositoryMixin(RestApplication)),
) {
  constructor(options: AppCustomConfig) {
    super(options);

    // Set up the custom sequence
    this.sequence(MySequence);

    // Set up default home page
    this.static('/', path.join(__dirname, '../public'));

    // configure logging system
    this.configureLogging(options);

    // configure error handling
    this.configureErrorHandling(options);

    // configure rest explorer
    this.configureRestExplorer(options);

    // bind configuration
    this.bindConfiguration(options);

    // mount authentication system
    this.configureAuthentication();

    // configure health check
    this.configureHealthChecks();

    // configure cron jobs
    this.configureCronJobs(options);

    // Register multipart parser
    this.bodyParser(MultipartFormDataBodyParser);

    // Customize @loopback/boot Booter Conventions here
    this.projectRoot = __dirname;

    this.bootOptions = {
      controllers: {
        // Customize ControllerBooter Conventions here
        dirs: ['controllers'],
        extensions: ['.controller.js'],
        nested: true,
      },
    };
  }

  private configureErrorHandling(options: AppCustomConfig) {
    this.bind(ErrorBindings.ERROR_SERVICE).toClass(ErrorService);
  }

  private configureLogging(options: AppCustomConfig) {
    this.configure(LoggingBindings.COMPONENT).to({
      enableFluent: false, // default to true
      enableHttpAccessLog: true, // default to true
    });

    const transportProvider = (level: string) =>
      new WinstonTransports.Console({
        level,
        format: format.combine(format.colorize(), format.simple()),
      });

    const standardFormat = format.combine(format.colorize(), format.simple());

    this.configure(LoggerBindings.ROOT_LOGGER).to({
      level: options.logging.rootLevel,
      format: standardFormat,
    });

    this.bind(LoggerBindings.DATASOURCE_LOGGER).to(
      winston.createLogger({
        transports: [transportProvider(options.logging.datasourceLevel)],
        format: standardFormat,
      }),
    );

    this.bind(LoggerBindings.SECURITY_LOGGER).to(
      winston.createLogger({
        transports: [transportProvider(options.logging.securityLevel)],
        format: standardFormat,
      }),
    );

    this.bind(LoggerBindings.SERVICE_LOGGER).to(
      winston.createLogger({
        transports: [transportProvider(options.logging.serviceLevel)],
        format: standardFormat,
      }),
    );

    this.bind(LoggerBindings.ONEDRIVE_LOGGER).to(
      winston.createLogger({
        transports: [transportProvider(options.logging.onedriveLevel)],
        format: standardFormat,
      }),
    );

    this.bind(LoggerBindings.S3_LOGGER).to(
      winston.createLogger({
        transports: [transportProvider(options.logging.s3Level)],
        format: standardFormat,
      }),
    );

    this.component(LoggingComponent);
  }

  private configureAuthentication() {
    this.component(AuthenticationComponent);

    // token auth strategy
    this.bind(TokenClientAuthenticationStrategyBindings.CLIENT_SERVICE).toClass(
      TokenAuthenticationClientService,
    );

    this.bind(TokenClientAuthenticationStrategyBindings.DEFAULT_OPTIONS).to({
      context: 'token-auth-ctx',
    });

    registerAuthenticationStrategy(this, TokenClientAuthenticationStrategy);
  }

  private configureRestExplorer(options: AppCustomConfig) {
    this.component(RestExplorerComponent);

    // customize @loopback/rest-explorer configuration here
    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
  }

  private bindConfiguration(options: AppCustomConfig) {
    // configure error handling
    this.bind(RestBindings.ERROR_WRITER_OPTIONS).to({
      debug: options.security.exposeErrorDetails,
    });

    // bind application config
    this.bind(ConfigurationBindings.ROOT_CONFIG).to(options);

    this.bind(ConfigurationBindings.SECURITY_CONFIG).to(options.security);

    // bind datasource config
    this.bind('datasources.config.Db').to(options.datasource);
  }

  private configureHealthChecks() {
    // mounting health check component
    this.component(HealthComponent);

    this.bind('health.DBHealthCheckProvider')
      .toProvider(DBHealthCheckProvider)
      .tag(HealthTags.LIVE_CHECK, HealthTags.READY_CHECK);
  }

  private configureCronJobs(options: AppCustomConfig) {
    // mounting cron jobs component
    this.component(CronComponent);

    this.add(createBindingFromClass(LogsCleanupCronJob));
    this.add(createBindingFromClass(FilesystemContentDeletionCronJob));
    this.add(createBindingFromClass(OnedriveContentDeletionCronJob));
    this.add(createBindingFromClass(UploadSessionsCleanupCronJob));
    this.add(createBindingFromClass(UploadFolderCleanupCronJob));
    this.add(createBindingFromClass(S3ContentDeletionCronJob));
  }
}
