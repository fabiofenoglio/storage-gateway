import {ObjectUtils} from './object-utils';

export abstract class PathUtils {
  public static cleanPath(raw: string): string {
    if (!ObjectUtils.isDefined(raw)) {
      return raw;
    }

    raw = raw.trim();
    raw = raw.replace(/[\\/]{1,}/g, '/');
    raw = raw.trim();
    if (!raw.startsWith('/')) {
      raw = '/' + raw;
    }

    if (raw === '/') {
      return raw;
    }

    while (raw.endsWith('/')) {
      raw = raw.substr(0, raw.length - 1);
      raw = raw.trim();
    }

    return raw;
  }
}
