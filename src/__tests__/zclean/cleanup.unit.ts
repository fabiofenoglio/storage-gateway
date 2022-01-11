/* eslint-disable @typescript-eslint/no-invalid-this */
import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../application';
import {ClientTenantBackbone} from '../../models';
import {S3ContentManager} from '../../services';
import {givenMixedTenantConfigurations} from '../helper/data-helper';
import {givenPrincipal} from '../helper/security-helper';
import {setupApplication} from '../helper/test-helper';

describe('Cleanup', () => {
  let app: StorageGatewayApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    expect(app).to.not.be.undefined();
    expect(client).to.not.be.undefined();
  });

  after(async () => {
    await app.stop();
  });

  const getService = async () => {
    const service: S3ContentManager = await app.get(
      'services.S3ContentManager',
    );
    expect(service).to.not.be.undefined();
    return service;
  };

  it('cleans S3 backbones', async function () {
    this.timeout(0);
    const service = await getService();
    expect(service).to.not.be.undefined();

    const principal = givenPrincipal();
    const mixedTenants = await givenMixedTenantConfigurations(
      app,
      principal.profile,
    );

    const s3Tenants = mixedTenants.filter(
      t => t.backboneType === ClientTenantBackbone.S3,
    );

    for (const s3Tenant of s3Tenants) {
      console.log('purging tenant on ' + s3Tenant.name);
      await service.purgePhysicalContent(s3Tenant);
      console.log('purged tenant on ' + s3Tenant.name);
    }
  });
});
