import * as crypto from 'crypto';
import * as rangeStream from 'range-stream';
import {PassThrough, pipeline, Readable, Writable} from 'stream';

export abstract class StreamUtils {
  public static isReadable(raw: unknown): boolean {
    if (raw === null || raw === undefined) {
      return false;
    }
    const sus = raw as Readable;
    return typeof sus.pipe === 'function' && typeof sus.on === 'function';
  }

  public static pipeWithErrors<I extends Readable, O extends Writable>(
    ins: I,
    outs: O,
    cb?: (err?: Error) => {},
  ): O {
    const piped = ins.pipe(outs);

    ins.on('error', e => {
      ins.destroy();
      piped.emit('error', e);
      if (cb) {
        cb(e);
      }
      piped.destroy();
    });

    ins.on('end', () => {
      if (cb) {
        cb(undefined);
      }
    });

    return outs;
  }

  public static async streamToVoid(stream: Readable): Promise<void> {
    return new Promise((res, rej) => {
      pipeline(stream, StreamUtils.sinkholeWritable(), err => {
        if (err) {
          rej(err);
        } else {
          res();
        }
      });
    });
  }

  public static async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any[] = [];

      stream.on('data', chunk => {
        data.push(chunk);
      });

      stream.on('end', () => {
        resolve(Buffer.concat(data));
      });

      stream.on('error', err => {
        reject(err);
      });
    });
  }

  public static readStreamFromBuffer(
    buffer: Buffer,
    range?: number[],
  ): Readable {
    if (!buffer) {
      throw new Error('A buffer is required to read from');
    }
    return new Readable({
      read() {
        if (range?.length) {
          this.push(buffer?.slice(range[0], range[1] + 1));
        } else {
          this.push(buffer);
        }
        this.push(null);
      },
    });
  }

  public static hashStreamContent(
    stream: Readable,
    algorithm = 'md5',
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Algorithm depends on availability of OpenSSL on platform
      // Another algorithms: 'sha1', 'md5', 'sha256', 'sha512' ...
      const shasum = crypto.createHash(algorithm);
      try {
        const s = stream;
        s.on('data', function (data) {
          shasum.update(data);
        });
        // making digest
        s.on('end', function () {
          const hash = shasum.digest('hex');
          return resolve(hash);
        });
      } catch (error) {
        return reject('calc fail');
      }
    });
  }

  public static writableToPromise(stream: Writable): Promise<void> {
    return new Promise((res, rej) => {
      try {
        stream
          .on('error', err => {
            rej(err);
          })
          .on('finish', () => {
            res();
          });
      } catch (e1) {
        rej(e1);
      }
    });
  }

  public static sinkholeWritable(): Writable {
    const w = new Writable();
    w._write = function (chunk, encoding, done) {
      done();
    };
    return w;
  }

  public static substream(start: number, end: number): PassThrough {
    if (start == null) {
      throw new Error('start is required');
    }
    if (end == null) {
      throw new Error('end is required');
    }
    return rangeStream.default(start, end);
  }
}
