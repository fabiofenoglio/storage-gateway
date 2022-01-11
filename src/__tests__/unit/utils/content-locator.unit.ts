import {expect} from '@loopback/testlab';
import {ContentStreamer} from '../../../models/content/content-streamer.model';
import {StreamUtils} from '../../../utils/stream-utils';
import {getResource} from '../../helper/data-helper';
import {enableIntegrationTests} from '../../helper/test-helper';

describe('Content locator (unit)', () => {
  if (enableIntegrationTests()) {
    describe('fromUrl()', () => {
      it('gets data from remote URL with a HTTP GET request', async function () {
        // eslint-disable-next-line @typescript-eslint/no-invalid-this
        this.timeout(10000);

        const contentLocator = ContentStreamer.fromURL('http://www.google.com');
        const contentStream = await contentLocator.stream();

        await StreamUtils.streamToBuffer(contentStream);
      });

      it('works with HTTPS', async function () {
        // eslint-disable-next-line @typescript-eslint/no-invalid-this
        this.timeout(10000);
        const contentLocator = ContentStreamer.fromURL(
          'https://jsonplaceholder.typicode.com/users/1',
        );
        const contentStream = await contentLocator.stream();

        const readBuffer = await StreamUtils.streamToBuffer(contentStream);

        const expected = await getResource('users-1-response.json');

        const uniformedRead = JSON.stringify(JSON.parse(readBuffer.toString()));
        const uniformedExp = JSON.stringify(JSON.parse(expected.toString()));

        expect(uniformedRead).to.eql(uniformedExp);
      });

      it('follows redirects', async function () {
        // eslint-disable-next-line @typescript-eslint/no-invalid-this
        this.timeout(10000);
        const contentLocator = ContentStreamer.fromURL(
          'https://httpstat.us/302',
        );
        const contentStream = await contentLocator.stream();

        const readBuffer = await StreamUtils.streamToBuffer(contentStream);
        const readBuffer2 = await StreamUtils.streamToBuffer(
          await ContentStreamer.fromURL('https://httpstat.us').stream(),
        );

        expect(readBuffer.compare(readBuffer2)).to.eql(0);
      });

      it('errors on missing URLs with error 404', async function () {
        // eslint-disable-next-line @typescript-eslint/no-invalid-this
        this.timeout(10000);
        const contentLocator = ContentStreamer.fromURL(
          'https://httpstat.us/404',
        );

        try {
          const contentStream = await contentLocator.stream();
          await StreamUtils.streamToBuffer(contentStream);
        } catch (err) {
          expect(err).to.not.be.undefined();
          expect((err as Error).message.includes('404')).to.be.true();
          return;
        }

        throw new Error("Didn't get the expected error");
      });

      it('errors on missing URLs with error 500', async function () {
        // eslint-disable-next-line @typescript-eslint/no-invalid-this
        this.timeout(10000);
        const contentLocator = ContentStreamer.fromURL(
          'https://httpstat.us/500',
        );

        try {
          const contentStream = await contentLocator.stream();
          await StreamUtils.streamToBuffer(contentStream);
        } catch (err) {
          expect(err).to.not.be.undefined();
          expect((err as Error).message.includes('500')).to.be.true();
          return;
        }

        throw new Error("Didn't get the expected error");
      });

      it('errors on unresolved name', async function () {
        // eslint-disable-next-line @typescript-eslint/no-invalid-this
        this.timeout(10000);
        const contentLocator = ContentStreamer.fromURL(
          'https://21huir389e24y94329t2iehfi43ifg42ky.com/nope',
        );

        try {
          const contentStream = await contentLocator.stream();
          await StreamUtils.streamToBuffer(contentStream);
        } catch (err) {
          expect(err).to.not.be.undefined();
          expect(err.code).to.eql('ENOTFOUND');
          return;
        }

        throw new Error("Didn't get the expected error");
      });
    });
  }
});
