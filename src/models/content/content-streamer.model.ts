import fs from 'fs';
import {Readable} from 'stream';
import {RequestUtils} from '../../utils/request-utils';
import {StreamUtils} from '../../utils/stream-utils';

export type DelayedStreamOpenResult = Readable;

export type DelayedStreamOpener = (
  range?: [number, number],
) => Promise<Readable | DelayedStreamOpenResult>;

export class ContentStreamer {
  public static empty() {
    return new ContentStreamer(undefined, undefined, undefined);
  }

  public static fromURL(url: string) {
    if (!url?.length) {
      throw new Error('A valid URL is required');
    }
    return new ContentStreamer(url, undefined, undefined);
  }

  public static fromPath(path: string) {
    if (!path?.length) {
      throw new Error('A valid path is required');
    }
    return new ContentStreamer(undefined, path, undefined);
  }

  public static fromBuffer(buffer: Buffer) {
    if (!buffer) {
      throw new Error('A valid buffer is required');
    }
    return new ContentStreamer(undefined, undefined, buffer);
  }

  public static fromStreamProvider(streamProvider: DelayedStreamOpener) {
    if (!streamProvider) {
      throw new Error('A valid streamProvider is required');
    }
    return new ContentStreamer(undefined, undefined, undefined, streamProvider);
  }

  private url: string | null;
  private path: string | null;
  private buffer: Buffer | null;
  private streamProvider: DelayedStreamOpener | null;

  private constructor(
    url?: string,
    path?: string,
    buffer?: Buffer,
    streamProvider?: DelayedStreamOpener,
  ) {
    this.url = url ?? null;
    this.path = path ?? null;
    this.buffer = buffer ?? null;
    this.streamProvider = streamProvider ?? null;
  }

  get location(): string {
    if (!this.hasUrl) {
      throw new Error('no location defined');
    }
    return this.url!;
  }

  get hasContent(): boolean {
    return this.hasLocalContent || this.hasRemoteContent;
  }

  get hasLocalContent(): boolean {
    return this.hasBuffer || this.hasPath || this.hasStreamProvider;
  }

  get hasRemoteContent(): boolean {
    return this.hasUrl;
  }

  get hasStreamProvider(): boolean {
    return !!this.streamProvider;
  }

  get hasUrl(): boolean {
    return !!this.url?.length;
  }

  get hasPath(): boolean {
    return !!this.path?.length;
  }

  get hasBuffer(): boolean {
    return !!this.buffer;
  }

  public async toBuffer(range?: number[]): Promise<Buffer> {
    if (!this.hasContent) {
      throw new Error('No content to buffer');
    }

    if (this.hasBuffer && !range?.length) {
      return this.buffer!;
    }

    return StreamUtils.streamToBuffer(await this.stream());
  }

  public async stream(range?: [number, number]): Promise<Readable> {
    if (!this.hasContent) {
      throw new Error('No content to stream');
    }

    if (range?.length) {
      // range must be valid
      if (range.length > 2) {
        throw new Error('Range parameter must have at most 2 elements');
      }
      if (range.length === 2 && range[1] < range[0]) {
        throw new Error('Range parameter must be consisted of ordered numbers');
      }
      if (range.filter(o => o < 0).length) {
        throw new Error('Range parameters must be positive');
      }
    }

    if (this.hasStreamProvider) {
      const inputStream = await this.streamProvider!(range);
      return inputStream;
    } else if (this.hasBuffer) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const orig = this;
      return StreamUtils.readStreamFromBuffer(orig.buffer!, range);
    } else if (this.hasPath) {
      return fs.createReadStream(
        this.path!,
        range ? {start: range[0], end: range[1]} : undefined,
      );
    } else if (this.hasUrl) {
      return RequestUtils.readStreamFromURL(this.url!, range);
    } else {
      throw new Error('Unkown content source to stream');
    }
  }
}
