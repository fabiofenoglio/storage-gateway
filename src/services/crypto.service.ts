import {inject, injectable} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import crypto, {CipherGCM} from 'crypto';
import {Readable} from 'stream';
import {LoggerBindings} from '../key';
import {
  IDecryptionSpecifications,
  IEncryptionSpecifications,
} from '../models/crypto/crypto-models.model';
import {ObjectUtils} from '../utils';
import {StreamUtils} from '../utils/stream-utils';

export interface EncryptionPiping {
  stream: CipherGCM;
  specs: IDecryptionSpecifications;
  cipher: CipherGCM;
}

@injectable()
export class CryptoService {
  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER) private logger: WinstonLogger,
  ) {}

  public encryptionStream(
    inputStream: Readable,
    specs: IEncryptionSpecifications,
  ): EncryptionPiping {
    ObjectUtils.notNull(specs, specs.alg);

    const alg = specs.alg;
    const key = specs?.key
      ? Buffer.from(specs.key, 'hex')
      : crypto.randomBytes(32);
    const iv = specs?.iv
      ? Buffer.from(specs.iv, 'hex')
      : crypto.randomBytes(16);

    const outputSpecs: IDecryptionSpecifications = {
      alg,
      key: key.toString('hex'),
      iv: iv.toString('hex'),
    };

    const cipher = crypto.createCipheriv(alg, key, iv) as crypto.CipherGCM;

    const pipedStream = StreamUtils.pipeWithErrors(inputStream, cipher);

    return {
      stream: pipedStream,
      specs: outputSpecs,
      cipher,
    };
  }

  public decryptionStream(
    inputStream: Readable,
    encryption: IDecryptionSpecifications,
  ) {
    const alg = encryption.alg;
    const key = Buffer.from(encryption.key!, 'hex');
    let iv = Buffer.from(encryption.iv!, 'hex');

    if (encryption?.ivOffset) {
      iv = CryptoService.getOffsetedIV(iv, encryption.ivOffset);
    }

    const decipher = crypto.createDecipheriv(
      alg,
      key,
      iv,
    ) as crypto.DecipherGCM;

    if (encryption.auth) {
      decipher.setAuthTag(Buffer.from(encryption.auth, 'hex'));
    }

    const pipedStream = StreamUtils.pipeWithErrors(inputStream, decipher);

    return {
      stream: pipedStream,
    };
  }

  public static getBlocksCoveringRange(
    range: [number, number],
    maxSize: number,
    blockSize: number,
  ) {
    const start = range[0];
    const end = range[1];
    ObjectUtils.notNull(start, end, maxSize, blockSize);

    /*
    es. requested 250 - 379 with block size 100 ->
      floor(250/100)*100 = floor(2.50)*100 = 200
      ceil((379+1)/100)*100-1 = ceil(3.80)*100-1 = 400-1 = 399
      so [200, 399]

    es. requested 200 - 499 with block size 100 ->
      floor(200/100)*100 = floor(2.00)*100 = 200
      ceil((499+1)/100)*100-1 = ceil(5.00)*100-1 = 500-1 = 499
      so [200, 499]

    es. requested 200 - 500 with block size 100 (1 of block outstanding) ->
      floor(200/100)*100 = floor(2.00)*100 = 200
      ceil((500+1)/100)*100-1 = ceil(5.01)*100-1 = 600-1 = 599
      so [200, 599]
    */
    const fetchRanges = [
      Math.floor(start / blockSize) * blockSize,
      Math.ceil((end + 1) / blockSize) * blockSize - 1,
    ];

    if (fetchRanges[1] >= maxSize) {
      // do not fetch over max available
      fetchRanges[1] = maxSize - 1;
    }

    const bytesToFetch = fetchRanges[1] - fetchRanges[0] + 1;
    const blocksToFetch = Math.ceil(bytesToFetch / blockSize);
    const firstBlockIndex = fetchRanges[0] / blockSize;
    let skipStart = 0;
    let endIndex = 0;
    let different = false;

    if (fetchRanges[0] !== start || fetchRanges[1] !== end) {
      different = true;
      skipStart = start - fetchRanges[0];
      endIndex = skipStart + (end - start);
    }

    return {
      blockSize,
      requested: {
        start,
        end,
      },
      fetch: {
        start: fetchRanges[0],
        end: fetchRanges[1],
        bytes: bytesToFetch,
        blocks: blocksToFetch,
        blockOffset: firstBlockIndex,
      },
      different,
      afterFilter: different
        ? {
            start: skipStart,
            end: endIndex,
          }
        : undefined,
    };
  }

  public static getOffsetedIV(baseIV: Buffer, increment: number): Buffer {
    if (baseIV.length !== 16) {
      throw new Error('Only implemented for 16 bytes IV');
    }

    const iv = Buffer.alloc(baseIV.length);
    baseIV.copy(iv);

    const MAX_UINT32 = 0xffffffff;
    const incrementBig = ~~(increment / MAX_UINT32);
    const incrementLittle = (increment % MAX_UINT32) - incrementBig;

    // split the 128bits IV in 4 numbers, 32bits each
    let overflow = 0;
    for (let idx = 0; idx < 4; ++idx) {
      let num = iv.readUInt32BE(12 - idx * 4);

      let inc = overflow;
      if (idx === 0) {
        inc += incrementLittle;
      }
      if (idx === 1) {
        inc += incrementBig;
      }

      num += inc;

      const numBig = ~~(num / MAX_UINT32);
      const numLittle = (num % MAX_UINT32) - numBig;
      overflow = numBig;

      iv.writeUInt32BE(numLittle, 12 - idx * 4);
    }

    return iv;
  }
}
