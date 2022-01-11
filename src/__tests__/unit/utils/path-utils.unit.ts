import {expect} from '@loopback/testlab';
import {PathUtils} from '../../../utils/path-utils';

describe('Path Utils (unit)', () => {
  // we recommend to group tests by method names
  describe('cleanPath()', () => {
    it('cleans that damn path well', () => {
      const couples = [
        ['/', '/'],
        ['\\', '/'],
        ['/\\\\//\\/', '/'],
        ['/\\\\//\\/', '/'],
        ['/b\\\\a//\\/', '/b/a'],
        ['folder ', '/folder'],
        ['/fold1/fold2/ ', '/fold1/fold2'],
        [' fold1/fold2// ', '/fold1/fold2'],
        ['  /fold1/fold2/// ', '/fold1/fold2'],
      ];

      for (const couple of couples) {
        const from = couple[0];
        const to = couple[1];
        expect(PathUtils.cleanPath(from)).to.equal(
          to,
          `should clean "${from}" to "${to}"`,
        );
      }
    });
  });
});
