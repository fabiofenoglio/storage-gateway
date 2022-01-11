import {HttpErrors} from '@loopback/rest';
import {Readable} from 'stream';
import {StreamUtils} from './stream-utils';

/* eslint-disable @typescript-eslint/no-explicit-any */
export abstract class ObjectUtils {
  public static ARRAY_MERGE_POLICY_CONCAT = 'c';
  public static ARRAY_MERGE_POLICY_REPLACE = 'r';
  public static ARRAY_MERGE_POLICY_DEFAULT =
    ObjectUtils.ARRAY_MERGE_POLICY_REPLACE;

  public static OBJECT_MERGE_POLICY_MERGE = 'm';
  public static OBJECT_MERGE_POLICY_REPLACE = 'r';
  public static OBJECT_MERGE_POLICY_DEFAULT =
    ObjectUtils.OBJECT_MERGE_POLICY_MERGE;

  public static isDefined(raw: any): boolean {
    if (raw === null || raw === undefined || typeof raw === 'undefined') {
      return false;
    }
    return true;
  }

  public static getPropertyValue(
    object: any,
    field: string,
  ): string | undefined {
    if (ObjectUtils.isNull(object)) {
      return undefined;
    }
    if (field.indexOf('.') === -1) {
      return object[field];
    }
    const splitted = field.split('.');
    const subObject = object[splitted[0]];
    return this.getPropertyValue(subObject, splitted.slice(1).join('.'));
  }

  public static setPropertyValue(object: any, field: string, value: any): void {
    if (ObjectUtils.isNull(object)) {
      return;
    }
    if (field.indexOf('.') === -1) {
      object[field] = value;
      return;
    }
    const splitted = field.split('.');
    let subObject = object[splitted[0]];
    if (ObjectUtils.isNull(subObject)) {
      subObject = {};
      object[splitted[0]] = subObject;
    }
    return this.setPropertyValue(subObject, splitted.slice(1).join('.'), value);
  }

  public static clone<T>(source: T): T {
    const isObject = (x: any) => x && typeof x === 'object';
    if (ObjectUtils.isNull(source)) {
      return source;
    } else if (Array.isArray(source)) {
      return (source as any[]).map((el: any) => ObjectUtils.clone(el)) as any;
    } else if (source instanceof Date) {
      return new Date(source.getTime()) as any;
    } else if (isObject(source)) {
      const cloned: any = {};
      Object.keys(source).forEach(key => {
        cloned[key] = ObjectUtils.clone((source as any)[key] as any);
      });
      return cloned as any;
    } else {
      return source;
    }
  }

  public static mergeDeep(
    target: any,
    source: any,
    arrayPolicy = ObjectUtils.ARRAY_MERGE_POLICY_DEFAULT,
    objectPolicy = ObjectUtils.OBJECT_MERGE_POLICY_DEFAULT,
  ) {
    const isObject = (obj: any) => obj && typeof obj === 'object';

    return [source].reduce((prev, obj) => {
      Object.keys(obj).forEach(key => {
        const pVal = prev[key];
        const oVal = obj[key];

        if (Array.isArray(oVal)) {
          if (arrayPolicy === ObjectUtils.ARRAY_MERGE_POLICY_CONCAT) {
            if (Array.isArray(pVal)) {
              prev[key] = pVal.concat(...oVal);
            } else {
              prev[key] = oVal.map(o => o);
            }
          } else {
            prev[key] = oVal;
          }
        } else if (oVal instanceof Date) {
          prev[key] = oVal;
        } else if (isObject(oVal)) {
          if (objectPolicy === ObjectUtils.OBJECT_MERGE_POLICY_MERGE) {
            if (isObject(pVal)) {
              prev[key] = ObjectUtils.mergeDeep(pVal, oVal);
            } else {
              prev[key] = ObjectUtils.mergeDeep({}, oVal);
            }
          } else {
            prev[key] = ObjectUtils.mergeDeep({}, oVal);
          }
        } else {
          prev[key] = oVal;
        }
      });

      return prev;
    }, target);
  }

  public static notNull(...values: any): void {
    for (const v of values) {
      if (ObjectUtils.isNull(v)) {
        throw Error('A not-null value is required');
      }
    }
  }

  public static coalesce<T>(values: T | T[]): T | null {
    for (const v of Array.isArray(values) ? values : [values]) {
      if (!ObjectUtils.isNull(v)) {
        return v;
      }
    }
    return null;
  }

  public static exactlyOne<T>(fieldNumber: string, values: T | T[]): T {
    let ret: T | null = null;
    for (const v of Array.isArray(values) ? values : [values]) {
      if (!ObjectUtils.isNull(v)) {
        if (!ObjectUtils.isNull(ret)) {
          throw new HttpErrors.BadRequest(
            'Exactly a single value is required for the field ' + fieldNumber,
          );
        }
        ret = v;
      }
    }
    if (ObjectUtils.isNull(ret)) {
      throw new HttpErrors.BadRequest(
        'A not-null value is required for the field ' + fieldNumber,
      );
    }
    return ret!;
  }

  public static isNull(v: any): boolean {
    return (
      v === null ||
      typeof v === 'undefined' ||
      Number.isNaN(v) ||
      (typeof v === 'string' && v.trim().length < 1)
    );
  }

  public static shuffle<T>(array: T[]) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  /* @deprecated use StreamUtils instead */
  public static readStreamFromBuffer(
    buffer: Buffer,
    range?: number[],
  ): Readable {
    return StreamUtils.readStreamFromBuffer(buffer, range);
  }

  public static require<X, K extends keyof X>(
    obj: X,
    key: K,
  ): NonNullable<X[K]> {
    const v = obj[key]; // Inferred type is T[K]
    if (ObjectUtils.isNull(v)) {
      throw new HttpErrors.InternalServerError('Field ' + key + ' is required');
    }
    return v!;
  }

  public static requireOrBadRequest<X, K extends keyof X>(
    obj: X,
    key: K,
  ): NonNullable<X[K]> {
    const v = obj[key]; // Inferred type is T[K]
    if (ObjectUtils.isNull(v)) {
      throw new HttpErrors.BadRequest('Field ' + key + ' is required');
    }
    return v!;
  }

  public static requireNotNull<X>(obj: X): NonNullable<X> {
    if (ObjectUtils.isNull(obj)) {
      throw new HttpErrors.InternalServerError('Field is required');
    }
    return obj!;
  }

  public static chunkify<T>(input: T[], maxSize: number): T[][] {
    const out: T[][] = [];

    for (let i = 0; i < input.length; i += maxSize) {
      out.push(input.slice(i, i + maxSize));
    }

    return out;
  }

  public static indexByString<T>(
    input: T[],
    value: (i: T) => string,
  ): {[key: string]: T[]} {
    const out: {[key: string]: T[]} = {};

    for (const v of input) {
      const k = value(v);
      if (!out[k]) {
        out[k] = [];
      }
      out[k].push(v);
    }

    return out;
  }

  public static indexBy<T>(
    input: T[],
    value: (i: T) => number,
  ): {[key: number]: T[]} {
    const out: {[key: number]: T[]} = {};

    for (const v of input) {
      const k = value(v);
      if (!out[k]) {
        out[k] = [];
      }
      out[k].push(v);
    }

    return out;
  }

  public static groupBy<T>(
    input: T[],
    value: (i: T) => number,
  ): [number, T[]][] {
    const indexed = ObjectUtils.indexBy(input, value);
    const out: [number, T[]][] = [];
    for (const k of Object.keys(indexed)) {
      const nk = parseInt(k, 10);
      out.push([nk, indexed[nk]]);
    }
    return out;
  }
}
