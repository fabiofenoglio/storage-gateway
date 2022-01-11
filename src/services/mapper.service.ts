import {injectable} from '@loopback/core';
import {
  ContentMetadata,
  StorageNode,
  StorageNodeMetadata,
  StorageNodeShare,
} from '../models';
import {AbstractContent} from '../models/content/abstract-content.model';
import {ContentEncryptionMetadata} from '../models/content/content-encryption-metadata.model';
import {ContentMetadataHashes} from '../models/content/content-metadata-hashes.model';
import {ContentMetadataImageThumbnail} from '../models/content/content-metadata-image-thumbnail.model';
import {ContentMetadataImage} from '../models/content/content-metadata-image.model';
import {ContentMetadataVideo} from '../models/content/content-metadata-video.model';
import {AuditEntity} from '../models/proto';
import {StorageNodeDetailDto, StorageNodeResumeDto} from '../rest';
import {AuditFieldsDto} from '../rest/dto/audit-fields-dto.model';
import {ContentDto} from '../rest/dto/content-dto.model';
import {ContentEncryptionMetadataDto} from '../rest/dto/content-encryption-metadata-dto.model';
import {ContentMetadataDto} from '../rest/dto/content-metadata-dto.model';
import {ContentMetadataHashesDto} from '../rest/dto/content-metadata-hashes-dto.model';
import {ContentMetadataImageDto} from '../rest/dto/content-metadata-image-dto.model';
import {ContentMetadataImageThumbnailDto} from '../rest/dto/content-metadata-image-thumbnail-dto.model';
import {ContentMetadataVideoDto} from '../rest/dto/content-metadata-video-dto.model';
import {MetadataDto} from '../rest/dto/metadata-dto.model';
import {NodeShareDto} from '../rest/dto/node-share-dto.model';

@injectable()
export class MapperService {
  logPrefix = '[mapper] ';

  constructor() {
    // NOP
  }

  public toStorageNodeResumeDto(
    entity: StorageNode,
    content: AbstractContent | undefined,
    metadata: StorageNodeMetadata[],
  ): StorageNodeResumeDto {
    if (!entity) {
      return entity;
    }
    return new StorageNodeResumeDto({
      ...entity,
      parent: entity?.parentUuid,
      content: content ? this.toContentDto(content) : undefined,
      audit: this.toAuditFieldsDto(entity),
      metadata: (metadata ?? []).map(o => this.toMetadataDto(o)),
    });
  }

  public toStorageNodeDetailDto(
    entity: StorageNode,
    content: AbstractContent | undefined,
    metadata: StorageNodeMetadata[],
  ): StorageNodeDetailDto {
    if (!entity) {
      return entity;
    }

    return new StorageNodeDetailDto({
      ...entity,
      parent: entity?.parentUuid,
      content: content ? this.toContentDto(content) : undefined,
      audit: this.toAuditFieldsDto(entity),
      metadata: (metadata ?? []).map(o => this.toMetadataDto(o)),
    });
  }

  public toMetadataDto(entity: StorageNodeMetadata): MetadataDto {
    if (!entity) {
      return entity;
    }
    return new MetadataDto({
      ...entity,
      audit: this.toAuditFieldsDto(entity),
    });
  }

  public toAuditFieldsDto(entity: AuditEntity): AuditFieldsDto {
    if (!entity) {
      return entity;
    }
    const mapped = new AuditFieldsDto(entity);
    return mapped;
  }

  public toContentDto(entity: AbstractContent): ContentDto {
    return new ContentDto({
      ...entity,
      metadata: this.toContentMetadataDto(entity.metadata),
      encryption: this.toContentEncryptionMetadataDto(entity.encryption),
      audit: this.toAuditFieldsDto(entity),
    });
  }

  private toContentEncryptionMetadataDto(
    entity?: ContentEncryptionMetadata | undefined,
  ): ContentEncryptionMetadataDto | undefined {
    if (!entity) {
      return entity;
    }
    return new ContentEncryptionMetadataDto({
      algorithm: entity.alg,
    });
  }

  private toContentMetadataDto(
    entity: ContentMetadata | undefined,
  ): ContentMetadataDto | undefined {
    if (!entity) {
      return entity;
    }
    return new ContentMetadataDto({
      ...entity,
      hashes: this.toContentMetadataHashesDto(entity.hashes),
      image: this.toContentMetadataImageDto(entity.image),
      video: this.toContentMetadataVideoDto(entity.video),
    });
  }

  private toContentMetadataHashesDto(
    entity: ContentMetadataHashes | undefined,
  ): ContentMetadataHashesDto | undefined {
    if (!entity) {
      return entity;
    }
    return new ContentMetadataHashesDto({
      ...entity,
    });
  }

  private toContentMetadataImageDto(
    entity: ContentMetadataImage | undefined,
  ): ContentMetadataImageDto | undefined {
    if (!entity) {
      return entity;
    }
    return new ContentMetadataImageDto({
      ...entity,
      thumbnails: entity.thumbnails
        ? entity.thumbnails.map(
            t => this.toContentMetadataImageThumbnailDto(t)!,
          )
        : undefined,
    });
  }

  private toContentMetadataVideoDto(
    entity: ContentMetadataVideo | undefined,
  ): ContentMetadataVideoDto | undefined {
    if (!entity) {
      return entity;
    }
    return new ContentMetadataVideoDto({
      ...entity,
      thumbnails: entity.thumbnails
        ? entity.thumbnails.map(
            t => this.toContentMetadataImageThumbnailDto(t)!,
          )
        : undefined,
    });
  }

  private toContentMetadataImageThumbnailDto(
    entity: ContentMetadataImageThumbnail | undefined,
  ): ContentMetadataImageThumbnailDto | undefined {
    if (!entity) {
      return entity;
    }
    return new ContentMetadataImageThumbnailDto({
      ...entity,
    });
  }

  public toNodeShareDto(
    entity: StorageNodeShare,
    embedUrl?: string,
  ): NodeShareDto {
    if (!entity) {
      return entity;
    }
    return new NodeShareDto({
      ...entity,
      shareUrl: embedUrl,
      audit: this.toAuditFieldsDto(entity),
    });
  }
}
