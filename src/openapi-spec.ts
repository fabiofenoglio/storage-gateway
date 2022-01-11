import {StorageGatewayApplication} from './application';
import {AppCustomConfig, ConfigurationUtils} from './utils/configuration-utils';

/**
 * Export the OpenAPI spec from the application
 */
async function exportOpenApiSpec(): Promise<void> {
  const config: AppCustomConfig = {
    ...ConfigurationUtils.buildConfiguration('acceptance'),
    rest: {
      port: +(process.env.PORT ?? 3000),
      host: process.env.HOST ?? 'localhost',
    },
  };
  const outFile = process.argv[2] ?? '';
  const app = new StorageGatewayApplication(config);
  await app.boot();
  await app.exportOpenApiSpec(outFile);
  process.exit(0);
}

exportOpenApiSpec().catch(err => {
  console.error('Fail to export OpenAPI spec from the application.', err);
  process.exit(1);
});
