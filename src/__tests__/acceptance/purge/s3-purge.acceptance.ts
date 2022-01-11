import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {S3ContentManager} from '../../../services';
import {setupApplication} from '../../helper/test-helper';

describe('S3 tenant purge', () => {
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

  it('purges the bucket', async () => {
    const service = await getService();
    expect(service).to.not.be.undefined();

    /*
    const principal = givenPrincipal();
    const mixedTenants = await givenMixedTenantConfigurations(
      app,
      principal.profile,
    );

    const s3Tenant = mixedTenants.find(
      t => t.backboneType === ClientTenantBackbone.S3,
    )!;
    expect(s3Tenant).to.not.be.undefined();

    await service.purgePhysicalContent(s3Tenant);
    */
  });
});
