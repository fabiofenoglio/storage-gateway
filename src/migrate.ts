import {StorageGatewayApplication} from './application';
import {ConfigurationUtils} from './utils/configuration-utils';

export async function migrate(args: string[]) {
  const existingSchema = args.includes('--rebuild') ? 'drop' : 'alter';
  console.log('Migrating schemas (%s existing schema)', existingSchema);

  const config = ConfigurationUtils.buildConfiguration();

  const app = new StorageGatewayApplication(config);
  await app.boot();
  await app.migrateSchema({
    existingSchema,
    models: ['AclStorageNodeRecord'],
  });
  console.log('done');

  // Connectors usually keep a pool of opened connections,
  // this keeps the process running even after all work is done.
  // We need to exit explicitly.
  process.exit(0);
}

migrate(process.argv).catch(err => {
  console.error('Cannot migrate database schema', err);
  process.exit(1);
});
