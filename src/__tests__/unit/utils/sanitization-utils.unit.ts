import {HttpErrors} from '@loopback/rest';
import {expect} from '@loopback/testlab';
import {SanitizationUtils} from '../../../utils';

describe('Sanitization Utils (unit)', () => {
  // we recommend to group tests by method names
  describe('sanitizePath()', () => {
    it('throws bad request on bad paths', () => {
      const tests = [
        '../badpath!',
        '/../',
        './',
        '/COM9',
        '/asd/COM5',
        'C:\\windows\\system32',
      ];

      for (const test of tests) {
        expect(() => SanitizationUtils.sanitizePath(test)).to.throw(
          HttpErrors.BadRequest,
        );
      }
    });
  });
});
