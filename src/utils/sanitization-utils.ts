import {HttpErrors} from '@loopback/rest';
import path from 'path';
import {sanitize as sanitizeRawFilename} from 'sanitize-filename-ts';
import {StorageNodeShareType, StorageNodeType} from '../models';
import {ObjectUtils} from './object-utils';
import {PathUtils} from './path-utils';

export abstract class SanitizationUtils {
  public static sanitizeUUID(raw: string): string {
    if (!raw) {
      throw new HttpErrors.BadRequest();
    }

    if (!raw.match(/^[a-zA-Z0-9\-]{6,100}$/)) {
      throw new HttpErrors.BadRequest('Invalid UUID');
    }

    return raw;
  }

  public static sanitizeTenantCode(raw: string): string {
    if (!raw) {
      throw new HttpErrors.BadRequest();
    }
    // sanitize filename is a superset of desired sanitization
    const sanitized = sanitizeRawFilename(raw);
    if (sanitized !== raw) {
      throw new HttpErrors.BadRequest('Invalid tenant code');
    }

    if (!sanitized.match(/^[a-zA-Z0-9\-\_\.]{1,100}$/)) {
      throw new HttpErrors.BadRequest('Invalid tenant code');
    }

    return sanitized;
  }

  public static sanitizeFilename(raw: string): string {
    if (!raw) {
      throw new HttpErrors.BadRequest();
    }
    const sanitized = sanitizeRawFilename(raw);

    if (sanitized !== raw) {
      throw new HttpErrors.BadRequest('Invalid name for file or node');
    }

    return sanitized;
  }

  public static sanitizeContentType(raw: string): string {
    if (!raw || !raw.trim()) {
      throw new HttpErrors.BadRequest();
    }
    return raw.trim();
  }

  public static sanitizeMetadataKey(raw: string): string {
    if (!raw) {
      throw new HttpErrors.BadRequest();
    }
    const sanitized = sanitizeRawFilename(raw);
    if (sanitized !== raw) {
      throw new HttpErrors.BadRequest('Invalid metadata key');
    }

    if (!sanitized.match(/^[a-zA-Z0-9\-\_\.]{1,100}$/)) {
      throw new HttpErrors.BadRequest('Invalid metadata key');
    }

    return sanitized;
  }

  public static sanitizeContentKey(raw: string): string {
    if (!raw) {
      throw new HttpErrors.BadRequest();
    }
    const sanitized = sanitizeRawFilename(raw);
    if (sanitized !== raw) {
      throw new HttpErrors.BadRequest('Invalid content key');
    }

    if (!sanitized.match(/^[a-zA-Z0-9\-\_\.]{1,100}$/)) {
      throw new HttpErrors.BadRequest('Invalid content key');
    }

    return sanitized;
  }

  public static sanitizeContentAssetKey(raw: string): string {
    if (!raw) {
      throw new HttpErrors.BadRequest();
    }
    const sanitized = sanitizeRawFilename(raw);
    if (sanitized !== raw) {
      throw new HttpErrors.BadRequest('Invalid content asset key');
    }

    if (!sanitized.match(/^[a-zA-Z0-9\-\_\.\:]{1,100}$/)) {
      throw new HttpErrors.BadRequest('Invalid content asset key');
    }

    return sanitized;
  }

  public static sanitizeNodeType(raw: string): StorageNodeType {
    if (
      !raw ||
      (raw !== StorageNodeType.FILE && raw !== StorageNodeType.FOLDER)
    ) {
      throw new HttpErrors.BadRequest('Invalid node type');
    }
    return raw;
  }

  public static sanitizeShareType(raw: string): StorageNodeShareType {
    if (!raw || raw !== StorageNodeShareType.EMBED) {
      throw new HttpErrors.BadRequest('Invalid share type');
    }
    return raw;
  }

  public static sanitizePath(raw: string): string {
    if (!ObjectUtils.isDefined(raw)) {
      throw new HttpErrors.BadRequest();
    }
    const cleaned = PathUtils.cleanPath(raw);
    cleaned.split('/').forEach(t => {
      const cleanedToken = sanitizeRawFilename(t);
      if (cleanedToken !== t) {
        throw new HttpErrors.BadRequest('Invalid path token: "' + t + '"');
      }
    });

    return cleaned;
  }

  public static sanitizeAccessToken(raw: string): string {
    if (!raw) {
      throw new HttpErrors.BadRequest();
    }

    if (!raw.match(/^[a-zA-Z0-9\-]{6,100}$/)) {
      throw new HttpErrors.BadRequest('Invalid access token');
    }

    return raw;
  }

  /**
   * Validate file names to prevent them goes beyond the designated directory
   * @param fileName - File name
   */
  public static validateFileName(fileName: string, sandbox: string) {
    const resolved = path.resolve(sandbox, fileName);
    if (resolved.startsWith(sandbox)) return resolved;
    // The resolved file is outside sandbox
    throw new HttpErrors.BadRequest(`Invalid file name: ${fileName}`);
  }

  public static stripSlashes(raw: string): string {
    raw = raw.trim();
    while (raw.startsWith('/')) {
      raw = raw.substr(1);
      raw = raw.trim();
    }
    while (raw.endsWith('/')) {
      raw = raw.substr(0, raw.length - 1);
      raw = raw.trim();
    }
    return raw;
  }
}
