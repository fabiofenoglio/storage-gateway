import {inject, injectable} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {HttpErrors} from '@loopback/rest';
import * as digestStream from 'digest-stream';
import * as EtagStreamModule from 'etag-stream';
import sharp from 'sharp';
import {Readable} from 'stream';
import {LoggerBindings} from '../../key';
import {ContentMetadata} from '../../models';
import {AbstractContent} from '../../models/content/abstract-content.model';
import {ContentAssetMetadata} from '../../models/content/content-asset-metadata.model';
import {ContentMetadataHashes} from '../../models/content/content-metadata-hashes.model';
import {ContentMetadataImageThumbnail} from '../../models/content/content-metadata-image-thumbnail.model';
import {ContentMetadataImage} from '../../models/content/content-metadata-image.model';
import {
  ContentWithMetadata,
  IContentMetadata,
} from '../../models/content/content-models.model';
import {ContentStreamer} from '../../models/content/content-streamer.model';
import {
  SupportedHash,
  supportedHashesList,
  UploadedContent,
  UploadedContentHashes,
} from '../../models/content/content-upload-dto.model';
import {ObjectUtils} from '../../utils';
import {StreamUtils} from '../../utils/stream-utils';

export interface ContentProcessingContext {
  computeETag?: boolean;
  extractImageMetadata?: boolean;
  extractThumbnails?: boolean;
  requestedHashes?: ('md5' | 'sha1' | 'sha256')[];
  assetReceiver?: (asset: ContentWithMetadata) => Promise<boolean>;
}

@injectable()
export class ContentProcessorService {
  THUMBNAIL_BUFFERING_TRESHOLD = 1 * 1024 * 1024; // 1 MB
  engineVersion = 2;

  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER) private logger: WinstonLogger,
  ) {}

  public checkRequiredHashTypes(
    contentSource: UploadedContent,
    options?: ContentProcessingContext,
  ): SupportedHash[] {
    const defaultHash = 'sha1';
    if (options?.requestedHashes?.length) {
      const computeHashes = options.requestedHashes;
      if (!computeHashes.includes(defaultHash)) {
        computeHashes.push(defaultHash);
      }
      return computeHashes;
    }
    if (contentSource.hashes) {
      const computeHashes = Object.keys(contentSource.hashes).filter(
        k => contentSource.hashes![k as SupportedHash]?.length,
      ) as SupportedHash[];
      if (!computeHashes.includes(defaultHash)) {
        computeHashes.push(defaultHash);
      }
      return computeHashes;
    }
    return [defaultHash];
  }

  public async processContent(
    content: AbstractContent,
    contentSource: UploadedContent,
    options: ContentProcessingContext,
  ): Promise<ContentMetadata> {
    if (!contentSource.content?.hasContent) {
      throw new Error('No content source provided');
    }

    // parse input
    const computeETag = options?.computeETag ?? true;
    const computeHashes = this.checkRequiredHashTypes(contentSource, options);
    const isImage = this.isImage(content);
    const isVideo = this.isVideo(content);
    const extractThumbnails = isImage && (options?.extractThumbnails ?? true);
    const extractImageMetadata =
      isImage && (extractThumbnails || (options?.extractImageMetadata ?? true));

    const prefetchContentInBuffer =
      extractThumbnails &&
      content.contentSize &&
      content.contentSize <= this.THUMBNAIL_BUFFERING_TRESHOLD;

    const output = new ContentMetadata({
      ready: true,
      facets: [],
      engineVersion: this.engineVersion,
      processedAt: new Date(),
      assets: [],
      hashes: new ContentMetadataHashes({}),
    });

    // compute facets
    if (isImage) {
      output.facets!.push('image');
    }
    if (isVideo) {
      output.facets!.push('video');
    }

    // initialize buffer stream from source
    const streamOriginalContent = async () => contentSource.content.stream();
    let bufferStream = await streamOriginalContent();
    let streamFlowNeeded = false;

    // pipe buffer stream as needed in order to compute requested hashes
    for (const computeHash of computeHashes) {
      streamFlowNeeded = true;
      bufferStream = this.wrapStreamWithHashing(
        bufferStream,
        computeHash,
        (hash: string) => {
          output.hashes![computeHash] = hash;
        },
      );
    }

    // pipe buffer stream with etag computing if needed
    if (computeETag) {
      streamFlowNeeded = true;
      bufferStream = this.wrapStreamWithETag(
        bufferStream,
        (computed: string) => {
          output.contentETag = computed;
        },
      );
    }

    // pipe buffer stream with image metadata if needed
    if (isImage && extractImageMetadata) {
      streamFlowNeeded = true;
      bufferStream = this.wrapStreamWithImageMetadata(bufferStream, c => {
        output.image = new ContentMetadataImage({...c});
      });
    }

    // consume source stream either with reading in buffering if prefetching is required or piping into the void
    let prefetchedBuffer: Buffer | null = null;
    if (streamFlowNeeded) {
      if (prefetchContentInBuffer) {
        this.logger.debug(
          'flowing source stream into prefetching buffer to compute metadata',
        );
        prefetchedBuffer = await StreamUtils.streamToBuffer(bufferStream);
      } else {
        // read stream to null
        this.logger.debug(
          'flowing source stream into null writer to compute metadata',
        );
        await StreamUtils.streamToVoid(bufferStream);
      }
    }

    // verify hashes if requested
    this.verifyHashes(contentSource.hashes!, output.hashes);

    // check if thumbnails are needed
    if (extractThumbnails) {
      const breakpoints = this.computeThumbnailsToGenerate(output.image!);
      if (breakpoints?.length) {
        let streamProvider: () => Promise<Readable> = () => {
          this.logger.verbose(
            'possible minor performance hit: content stream is reopened to compute thumbnail',
          );
          return streamOriginalContent();
        };

        // if image size is less than treshold, buffering is actually better than streaming
        if (prefetchedBuffer) {
          this.logger.debug(
            'reusing prefetched source content memory buffer to improve performances',
          );
          streamProvider = () =>
            ContentStreamer.fromBuffer(prefetchedBuffer!).stream();
        } else if (prefetchContentInBuffer) {
          this.logger.debug(
            'precaching source content in memory buffer to improve performances',
          );
          prefetchedBuffer = await StreamUtils.streamToBuffer(
            await streamOriginalContent(),
          );
          streamProvider = () =>
            ContentStreamer.fromBuffer(prefetchedBuffer!).stream();
        }

        const thumbResult = await this.attemptThumbnailsGenerationViaStream(
          content,
          breakpoints,
          streamProvider,
          output.image,
          options,
        );

        output.image!.thumbnails = thumbResult.thumbnails;
        thumbResult.assets.forEach(asset => output.assets!.push(asset));
      }
    }

    return output;
  }

  private async attemptThumbnailsGenerationViaStream(
    content: AbstractContent,
    breakpoints: number[],
    inputStreamProvider: () => Promise<Readable>,
    imageMetadata?: ContentMetadataImage,
    options?: ContentProcessingContext,
  ): Promise<{
    thumbnails: ContentMetadataImageThumbnail[];
    assets: ContentAssetMetadata[];
  }> {
    const assets: ContentAssetMetadata[] = [];
    const thumbnails: ContentMetadataImageThumbnail[] = [];

    if (!imageMetadata) {
      throw new Error('Required image metadata are missing');
    }

    if (!options?.assetReceiver) {
      throw new Error('No asset receiver specified for metadata extraction');
    }

    for (const breakpoint of breakpoints) {
      this.logger.debug(`attempting to generate ${breakpoint} px thumbnail`);

      // wrap stream with thumbnail generation stream
      this.logger.debug(
        `reopening content stream to generate ${breakpoint} px thumbnail`,
      );

      const inputStream = await inputStreamProvider();

      const thumbBuffer = await this.generateThumbnailFromStream(
        content,
        inputStream,
        breakpoint,
        options.assetReceiver,
      );

      if (thumbBuffer) {
        thumbnails.push(thumbBuffer.thumbnail);
        assets.push(thumbBuffer.asset);
      }
    }

    return {thumbnails, assets};
  }

  private async generateThumbnailFromStream(
    content: AbstractContent,
    inputStream: Readable,
    width: number,
    receiver?: (asset: ContentWithMetadata) => Promise<boolean>,
  ): Promise<{
    thumbnail: ContentMetadataImageThumbnail;
    asset: ContentAssetMetadata;
  } | null> {
    try {
      const thumbStream = sharp()
        .resize({
          width,
          fit: 'contain',
        })
        .jpeg({
          quality: 50,
          force: false,
        });

      let piped = StreamUtils.pipeWithErrors(inputStream, thumbStream);

      const thumbMetadataStream = sharp();
      const thumbMetadataContainer: {m: sharp.Metadata | null} = {
        m: null,
      };

      thumbMetadataStream.on('info', (rawThumbMetadata: sharp.Metadata) => {
        thumbMetadataContainer.m = rawThumbMetadata;
      });

      piped = StreamUtils.pipeWithErrors(piped, thumbMetadataStream);

      this.logger.verbose(
        'possible minor performance hit: thumbnail content is cached into in-memory buffer',
      );
      const thumbBuffer = await StreamUtils.streamToBuffer(piped);

      const thumbMetadata = thumbMetadataContainer.m;
      if (!thumbMetadata) {
        throw new Error('Required thumbnail metadata is missing');
      }

      const thumbExt = this.typeToExtension(thumbMetadata);
      const thumbFilename =
        (content.originalName ?? content.uuid) +
        '-thumb' +
        width +
        (thumbExt ? '.' + thumbExt : '');
      const assetKey = 'thumbnails.w' + width;

      const assetMetadata: IContentMetadata = {
        key: assetKey,
        mimeType: 'image/' + ObjectUtils.require(thumbMetadata, 'format'),
        contentSize: ObjectUtils.require(thumbMetadata, 'size'),
        fileName: thumbFilename,
      };

      const asset: ContentWithMetadata = {
        content: ContentStreamer.fromBuffer(thumbBuffer),
        ...assetMetadata,
      };

      if (receiver) {
        this.logger.debug(
          `dispatching asset ${asset.key} - ${asset.fileName} to asset receiver`,
        );
        const rxResult = await receiver(asset);
        if (!rxResult) {
          this.logger.debug(
            `dispatching of asset ${asset.key} - ${asset.fileName} was rejected from asset receiver`,
          );
          return null;
        } else {
          this.logger.debug(
            `dispatching of asset ${asset.key} - ${asset.fileName} was acknowledged from asset receiver`,
          );
        }
      }

      return {
        thumbnail: new ContentMetadataImageThumbnail({
          ...thumbMetadata,
          assetKey,
          fileName: thumbFilename,
        }),
        asset: new ContentAssetMetadata({
          ...assetMetadata,
          encryption: asset.encryption,
          remoteId: asset.remoteId,
        }),
      };
    } catch (err) {
      this.logger.error('error generating thumbnail', err);
      return null;
    }
  }

  private wrapStreamWithImageMetadata(
    stream: Readable,
    metadataReceiver: (info: sharp.Metadata) => void,
  ) {
    const metadataStream = sharp();

    const piped = StreamUtils.pipeWithErrors(stream, metadataStream);

    piped.on('warning', warn => {
      this.logger.warn('warning emitted processing image metadata: ' + warn);
    });
    piped.on('info', (m: sharp.Metadata) => {
      metadataReceiver(m);
    });

    return piped;
  }

  public verifyHashes(
    declaredHashes: UploadedContentHashes | undefined,
    computed: UploadedContentHashes | undefined,
  ): void {
    if (!declaredHashes) {
      return;
    }
    for (const possibleHash of supportedHashesList) {
      const requestedHash = declaredHashes[possibleHash];
      if (requestedHash?.length) {
        const computedHash = (computed ?? {})[possibleHash];
        if (!computedHash?.length) {
          throw new HttpErrors.BadRequest(
            `Content hashing with ${possibleHash} algorithm was requested ` +
              `but is not supported from this application.`,
          );
        }

        if (computedHash.trim() !== requestedHash.trim()) {
          throw new HttpErrors.BadRequest(
            `Content verification with ${possibleHash} hashing failed: ` +
              `computed hash of '${computedHash}' was expected to be '${requestedHash}' instead.`,
          );
        }
      }
    }
  }

  private computeThumbnailsToGenerate(
    imageMetadata: ContentMetadataImage,
  ): number[] {
    if (!imageMetadata?.width) {
      return [];
    }

    const breakpoints = [
      [400, 200],
      [1000, 400],
      [2000, 800],
    ];
    const out: number[] = [];

    for (const breakpoint of breakpoints) {
      if ((imageMetadata?.width ?? 0) >= breakpoint[0]) {
        out.push(breakpoint[1]);
      }
    }

    return out;
  }

  public wrapStreamWithHashing(
    stream: Readable,
    type: SupportedHash,
    cb: (hash: string, alg: SupportedHash) => void,
  ) {
    return StreamUtils.pipeWithErrors(
      stream,
      digestStream.default(type, 'hex', (hash: string) => {
        cb(hash, type);
      }),
    );
  }

  public wrapStreamWithETag(stream: Readable, cb: (etag: string) => void) {
    const etagStream = new EtagStreamModule.default();

    etagStream.on('etag', (computed: string) => {
      cb(computed);
    });

    return StreamUtils.pipeWithErrors(stream, etagStream);
  }

  private isImage(content: AbstractContent): boolean {
    if (content.mimeType?.startsWith('image/')) {
      return true;
    }

    return false;
  }

  private isVideo(content: AbstractContent): boolean {
    if (content.mimeType?.startsWith('video/')) {
      return true;
    }

    return false;
  }

  private typeToExtension(metadata: sharp.Metadata): string | null {
    if (!metadata?.format?.length) {
      return null;
    }
    return metadata.format;
  }
}
