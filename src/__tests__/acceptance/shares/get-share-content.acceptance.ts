import {Client, expect} from '@loopback/testlab';
import {StorageGatewayApplication} from '../../../application';
import {
  AbstractContent,
  ClientTenant,
  StorageNode,
  StorageNodeShare,
  StorageNodeShareType,
  StorageNodeType,
} from '../../../models';
import {
  deletingShare,
  givenInMemoryTenants,
  givenShare,
  givenSomeContent,
  givenSomeNodes,
} from '../../helper/data-helper';
import {givenPrincipal, TestPrincipal} from '../../helper/security-helper';
import {setupApplication} from '../../helper/test-helper';

describe('Get share content', () => {
  let app: StorageGatewayApplication;
  let client: Client;
  let principal: TestPrincipal;
  let inMemoryTenants: ClientTenant[];
  let defaultTenant: ClientTenant;
  let rootNodes: StorageNode[];
  let defaultNode: StorageNode;
  let defaultContent: {content: AbstractContent; payload: Buffer};
  let defaultEmbedShare: StorageNodeShare;

  const shareUrl = (accessToken: string) =>
    '/shares/' + accessToken + '/content';

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    principal = givenPrincipal();
    inMemoryTenants = await givenInMemoryTenants(app, principal.profile);
    defaultTenant = inMemoryTenants[0];

    // populate default tenant
    rootNodes = await givenSomeNodes(app, defaultTenant);
    expect(rootNodes.length).to.be.greaterThan(0);

    defaultNode = rootNodes.find(o => o.type === StorageNodeType.FILE)!;
    expect(defaultNode).to.not.be.undefined();

    defaultContent = await givenSomeContent(app, defaultTenant, defaultNode);
    for (const rootFile of rootNodes.filter(
      o => o.type === StorageNodeType.FILE,
    )) {
      if (rootFile.id === defaultNode.id) {
        continue;
      }
      await givenSomeContent(app, defaultTenant, rootFile);
    }

    defaultEmbedShare = await givenShare(app, defaultNode, {
      type: StorageNodeShareType.EMBED,
    });
  });

  after(async () => {
    await app.stop();
  });

  it('should return 200 OK', async () => {
    const res = await client
      .get(shareUrl(defaultEmbedShare.accessToken))
      .expect(200);

    expect(res.headers['content-type']).to.startWith(
      defaultContent.content.mimeType!,
    );
  });

  it('should return 404 on missing access token', async () => {
    await client
      .get(shareUrl('missing-access-token'))
      .expect('Content-Type', /application\/json/)
      .expect(404);
  });

  it('should return the node binary content', async () => {
    const res = await client
      .get(shareUrl(defaultEmbedShare.accessToken))
      .expect(200);

    expect(res.headers['content-type']).to.startWith(
      defaultContent.content.mimeType!,
    );
    expect(res.headers['content-length']).to.equal(
      defaultContent.payload.length + '',
    );
    expect(res.body.compare(defaultContent.payload)).to.equal(0);
  });

  it('should return 400 when called with bad access token', async () => {
    const malformedCodes = [
      'asd-..-128918925-128918925',
      'ACCESS!-TOKEN-128918925',
      'àccess-token-128918925-128918925',
      ' ' + defaultEmbedShare.accessToken,
    ];
    for (const code of malformedCodes) {
      await client
        .get(shareUrl(code))
        .expect('Content-Type', /application\/json/)
        .expect(400);
    }
  });

  it('should no longer work after removing the share', async () => {
    await client.get(shareUrl(defaultEmbedShare.accessToken)).expect(200);
    await deletingShare(app, defaultEmbedShare);
    await client.get(shareUrl(defaultEmbedShare.accessToken)).expect(404);
  });
});
