import {CipherGCM} from 'crypto';
import {PassThrough} from 'stream';

import {service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {HttpErrors} from '@loopback/rest';

import {ClientTenant, Page, Pageable, StorageNode} from '../../models';
import {AbstractContent} from '../../models/content/abstract-content.model';
import {ContentEncryptionMetadata} from '../../models/content/content-encryption-metadata.model';
import {
  ContentWithMetadata,
  DeferredContentRetriever,
} from '../../models/content/content-models.model';
import {RequestedContentRange} from '../../models/content/content-range.model';
import {ContentStreamer} from '../../models/content/content-streamer.model';
import {UploadedContent} from '../../models/content/content-upload-dto.model';
import {
  EncryptedContentLocatorWrapper,
  IDecryptionSpecifications,
  IEncryptionSpecifications,
  supportedEncryptionPolicies,
} from '../../models/crypto/crypto-models.model';
import {RestContext} from '../../rest/rest-context.model';
import {ObjectUtils, SanitizationUtils} from '../../utils';
import {StreamUtils} from '../../utils/stream-utils';
import {CryptoService} from '../crypto.service';
import {MetricService} from '../metric.service';

export interface ContentRetrieveRequestConditions {
  ifNoneMatch?: string;
  range?: RequestedContentRange;
}

export abstract class AbstractContentManagerService<T extends AbstractContent> {
  @service(CryptoService)
  protected _cryptoService: CryptoService;

  @service(MetricService)
  protected _metricService: MetricService;

  constructor(protected _logger: WinstonLogger) {}

  abstract get typeCode(): string;

  abstract get enabled(): boolean;

  abstract createContent(
    tenant: ClientTenant,
    node: StorageNode,
    key: string,
    content: UploadedContent,
    context: RestContext,
  ): Promise<T>;

  abstract updateContent(
    tenant: ClientTenant,
    node: StorageNode,
    key: string,
    content: UploadedContent,
    context: RestContext,
  ): Promise<T>;

  abstract getContent(
    tenant: ClientTenant,
    node: StorageNode,
    key: string,
    context: RestContext,
  ): Promise<T | null>;

  abstract retrieveContent(
    tenant: ClientTenant,
    node: StorageNode,
    key: string,
    context: RestContext,
  ): Promise<DeferredContentRetriever>;

  abstract retrieveContentAsset(
    tenant: ClientTenant,
    node: StorageNode,
    key: string,
    assetKey: string,
    context: RestContext,
  ): Promise<DeferredContentRetriever>;

  abstract deleteContent(
    tenant: ClientTenant,
    node: StorageNode,
    key: string,
    context: RestContext,
  ): Promise<void>;

  abstract deletePhysicalContent(
    content: T,
    context: RestContext,
  ): Promise<boolean>;

  abstract getContentQueuedForDeletion(page: Pageable): Promise<Page<T>>;

  copyContent(
    sourceTenant: ClientTenant,
    sourceNode: StorageNode,
    targetTenant: ClientTenant,
    targetNode: StorageNode,
    context: RestContext,
  ): Promise<T | null> {
    throw new Error('NOT IMPLEMENTED');
  }

  protected async getEncryptionSpecifications(
    tenant: ClientTenant,
  ): Promise<IEncryptionSpecifications | null> {
    if (tenant.encryptionAlgorithm) {
      return {
        alg: tenant.encryptionAlgorithm,
      };
    }
    return null;
  }

  protected clientIdentifier(context: RestContext): string {
    if (!context?.client) {
      throw new Error('Invalid REST context');
    }
    if (typeof context.client === 'string') {
      return context.client;
    } else {
      return context.client.code;
    }
  }

  protected sanitizeTenantCode(raw: string): string {
    return SanitizationUtils.sanitizeTenantCode(raw);
  }

  protected sanitizeFilenameIfPresent(
    raw: string | undefined,
  ): string | undefined {
    if (!raw) {
      return raw;
    }
    return SanitizationUtils.sanitizeFilename(raw);
  }

  protected getOrError<X, K extends keyof X>(
    obj: X,
    key: K,
  ): NonNullable<X[K]> {
    const v = obj[key]; // Inferred type is T[K]
    if (typeof v === 'undefined' || v === null) {
      throw new HttpErrors.InternalServerError('Field ' + key + ' is required');
    }
    return v!;
  }

  protected static encodeURIComponentPath(raw: string): string {
    return raw
      .split('/')
      .map(t => encodeURIComponent(t))
      .join('/');
  }

  protected async patchWithEncryptionDataAfterWrite(
    entity: AbstractContent | ContentWithMetadata,
    wrapper: EncryptedContentLocatorWrapper,
  ) {
    if (wrapper.encryption?.alg) {
      const algSpecs = supportedEncryptionPolicies[wrapper.encryption.alg];
      if (algSpecs.authenticated) {
        wrapper.encryption.auth = (wrapper.cipher as CipherGCM)!
          .getAuthTag()
          .toString('hex');
      }
    }
    entity.encryption = new ContentEncryptionMetadata({
      ...wrapper.encryption,
    });
  }

  protected async wrapContentWithEncryption(
    source: ContentStreamer,
    encryption: IEncryptionSpecifications | null,
  ): Promise<EncryptedContentLocatorWrapper> {
    ObjectUtils.notNull(source);
    if (!source.hasContent) {
      throw new Error('Source content is missing');
    }

    if (!encryption?.alg) {
      return {content: source};
    }

    this._logger.debug(
      `encrypting content stream with algorithm ${encryption.alg}`,
    );
    const sourceStream = await source.stream();

    const encryptionPiping = this._cryptoService.encryptionStream(
      sourceStream,
      encryption,
    );

    return {
      content: ContentStreamer.fromStreamProvider(
        async () => encryptionPiping.stream,
      ),
      encryption: encryptionPiping.specs,
      cipher: encryptionPiping.cipher,
    };
  }

  protected async wrapContentWithDecryption(
    source: ContentStreamer,
    totalSize: number | null | undefined,
    encryption: IDecryptionSpecifications | null | undefined,
  ): Promise<ContentStreamer> {
    if (!source.hasContent) {
      throw new Error('Source content is missing');
    }

    if (!encryption?.alg) {
      return source;
    }

    ObjectUtils.notNull(source, totalSize);

    const encPolicy = supportedEncryptionPolicies[encryption?.alg];
    if (!encPolicy) {
      throw new Error('Unsupported encryption policy ' + encryption?.alg);
    }

    if (encPolicy.authenticated && !encryption?.auth) {
      throw new Error(
        'Encryption policy ' +
          encryption?.alg +
          ' requires authentication signature but none provided',
      );
    }

    return ContentStreamer.fromStreamProvider(async r => {
      // if source.hasUrl -> external read
      if (source.hasUrl) {
        this._metricService.registerExternalReadWithData();
      }

      const isRanged = !!r?.length;

      // fetch block for decryption
      const toFetch = isRanged
        ? CryptoService.getBlocksCoveringRange(
            r!,
            totalSize!,
            encPolicy.blockSize,
          )
        : null;

      if (toFetch?.different) {
        this._logger.verbose(
          'will fetch a different range from the one requested in order to have the needed blocks for decryption',
        );
      }

      const sourceStream = await source.stream(
        isRanged ? [toFetch!.fetch.start, toFetch!.fetch.end] : undefined,
      );

      this._logger.debug(
        `decrypting content stream with algorithm ${encryption.alg}`,
      );

      let decStream: PassThrough = this._cryptoService.decryptionStream(
        sourceStream,
        {
          ...encryption,
          ivOffset: toFetch?.fetch.blockOffset,
        },
      ).stream;

      if (toFetch?.different) {
        decStream = StreamUtils.pipeWithErrors(
          decStream,
          StreamUtils.substream(
            toFetch.afterFilter!.start,
            toFetch.afterFilter!.end,
          ),
        );
      }

      return decStream;
    });
  }

  protected mimeTypeToExtension(mimeType: string | undefined | null): string {
    if (!mimeType?.includes('/')) {
      return 'bin';
    }
    const ext = 'bin';
    mimeType = mimeType.trim().toLowerCase();
    const regexMatch = mimeType.match(/^[^\/]+\/([\w\-]+)/);
    const regexExt =
      regexMatch && regexMatch.length >= 2 ? regexMatch[1] : null;

    if (
      mimeType.startsWith('image/') ||
      mimeType.startsWith('video/') ||
      mimeType.startsWith('audio/')
    ) {
      return regexExt ?? ext;
    } else if (mimeType.startsWith('application/pdf')) {
      return 'pdf';
    } else if (mimeType.startsWith('application/octet-')) {
      return 'bin';
    }
    return regexExt ?? ext;
  }
}
