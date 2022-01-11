import {format, WinstonTransports} from '@loopback/logging';
import {HttpErrors} from '@loopback/rest';
import {expect} from '@loopback/testlab';
import winston from 'winston';
import {retry} from '../../../utils';

describe('Retry Utils (unit)', () => {
  // we recommend to group tests by method names
  describe('retry()', () => {
    it('retries', async () => {
      let counter = 0;
      const task = async () => {
        counter++;
        if (counter < 3) {
          throw new HttpErrors.Conflict('Not enough calls');
        }
        return 42;
      };

      const standardFormat = format.combine(format.colorize(), format.simple());
      const logger = winston.createLogger({
        transports: [
          new WinstonTransports.Console({
            level: 'debug',
            format: standardFormat,
          }),
        ],
        format: standardFormat,
      });

      const r = await retry(() => task(), {
        logger,
        description: 'test task',
        // with these settings takes approx. 9653 ms to fail 10 retries
        interval: 200,
        maxRetries: 10,
        linearBackoff: 0.33,
        exponentialBackoff: 1.25,
      });

      expect(r).to.equal(42);
    });
  });
});
