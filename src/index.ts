import minimist from 'minimist';

import {StorageGatewayApplication} from './application';
import {
  AppCustomConfig,
  ConfigurationUtils,
} from './utils/configuration-utils';

export * from './application';

export async function main(options: AppCustomConfig) {
  const app = new StorageGatewayApplication(options);
  await app.boot();
  await app.start();

  const url = app.restServer.url;
  console.log(`Server is running at ${url}`);
  console.log(`Try ${url}/ping`);

  return app;
}

if (require.main === module) {
  // Run the application
  const args = minimist(process.argv.slice(2));

  const config = ConfigurationUtils.buildConfiguration(args['profile'] ?? undefined);

  if (args['config']) {
    console.log(JSON.stringify(config, null, 2));
    process.exit(0);
  }

  main(config).catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
