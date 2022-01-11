/* eslint-disable @typescript-eslint/no-explicit-any */
import {PredicateComparison} from '@loopback/repository';
import {AnyFilter, EnumFilter, NumberFilter, StringFilter} from '../rest';
import {ObjectUtils} from './object-utils';

export abstract class FilterUtils {
  public static stringFilter(
    f: StringFilter | undefined,
  ): PredicateComparison<any> | undefined {
    if (!f) {
      return undefined;
    }

    const out: PredicateComparison<any> = {};
    let something = false;

    if (ObjectUtils.isDefined(f.equals)) {
      something = true;
      out.eq = f.equals;
    }
    if (ObjectUtils.isDefined(f.notEquals)) {
      something = true;
      out.neq = f.notEquals;
    }
    if (ObjectUtils.isDefined(f.in)) {
      something = true;
      out.inq = f.in;
    }
    if (ObjectUtils.isDefined(f.notIn)) {
      something = true;
      out.nin = f.notIn;
    }
    if (ObjectUtils.isDefined(f.specified)) {
      something = true;
      if (f.specified) {
        out.neq = null;
      } else {
        out.eq = null;
      }
    }
    if (ObjectUtils.isDefined(f.like)) {
      something = true;
      out.like = f.like;
    }
    if (ObjectUtils.isDefined(f.notLike)) {
      something = true;
      out.nlike = f.notLike;
    }

    return something ? out : undefined;
  }

  public static numberFilter(
    f: NumberFilter | undefined,
  ): PredicateComparison<any> | undefined {
    if (!f) {
      return undefined;
    }

    const out: PredicateComparison<any> = {};
    let something = false;

    if (ObjectUtils.isDefined(f.equals)) {
      something = true;
      out.eq = f.equals;
    }
    if (ObjectUtils.isDefined(f.notEquals)) {
      something = true;
      out.neq = f.notEquals;
    }
    if (ObjectUtils.isDefined(f.in)) {
      something = true;
      out.inq = f.in;
    }
    if (ObjectUtils.isDefined(f.notIn)) {
      something = true;
      out.nin = f.notIn;
    }
    if (ObjectUtils.isDefined(f.specified)) {
      something = true;
      if (f.specified) {
        out.neq = null;
      } else {
        out.eq = null;
      }
    }
    if (ObjectUtils.isDefined(f.greaterThan)) {
      something = true;
      out.gt = f.greaterThan;
    }
    if (ObjectUtils.isDefined(f.greaterOrEqualThan)) {
      something = true;
      out.gte = f.greaterOrEqualThan;
    }
    if (ObjectUtils.isDefined(f.lessThan)) {
      something = true;
      out.lt = f.lessThan;
    }
    if (ObjectUtils.isDefined(f.lessOrEqualThan)) {
      something = true;
      out.lte = f.lessOrEqualThan;
    }

    return something ? out : undefined;
  }

  public static enumFilter(
    f: EnumFilter<any> | undefined,
  ): PredicateComparison<any> | undefined {
    if (!f) {
      return undefined;
    }

    const out: PredicateComparison<any> = {};
    let something = false;

    if (ObjectUtils.isDefined(f.equals)) {
      something = true;
      out.eq = f.equals;
    }
    if (ObjectUtils.isDefined(f.notEquals)) {
      something = true;
      out.neq = f.notEquals;
    }
    if (ObjectUtils.isDefined(f.in)) {
      something = true;
      out.inq = f.in;
    }
    if (ObjectUtils.isDefined(f.notIn)) {
      something = true;
      out.nin = f.notIn;
    }
    if (ObjectUtils.isDefined(f.specified)) {
      something = true;
      if (f.specified) {
        out.neq = null;
      } else {
        out.eq = null;
      }
    }

    return something ? out : undefined;
  }

  public static anyFilter(
    f: AnyFilter | undefined,
    valueTransformer?: (input: any) => any,
  ): PredicateComparison<any> | undefined {
    if (!f) {
      return undefined;
    }
    if (!valueTransformer) {
      valueTransformer = x => x;
    }

    const out: PredicateComparison<any> = {};
    let something = false;

    if (ObjectUtils.isDefined(f.equals)) {
      something = true;
      out.eq = valueTransformer(f.equals);
    }
    if (ObjectUtils.isDefined(f.notEquals)) {
      something = true;
      out.neq = valueTransformer(f.notEquals);
    }
    if (ObjectUtils.isDefined(f.in)) {
      something = true;
      out.inq = f.in!.map(x => valueTransformer!(x));
    }
    if (ObjectUtils.isDefined(f.notIn)) {
      something = true;
      out.nin = f.notIn!.map(x => valueTransformer!(x));
    }
    if (ObjectUtils.isDefined(f.specified)) {
      something = true;
      if (f.specified) {
        out.neq = null;
      } else {
        out.eq = null;
      }
    }
    if (ObjectUtils.isDefined(f.greaterThan)) {
      something = true;
      out.gt = f.greaterThan;
    }
    if (ObjectUtils.isDefined(f.greaterOrEqualThan)) {
      something = true;
      out.gte = f.greaterOrEqualThan;
    }
    if (ObjectUtils.isDefined(f.lessThan)) {
      something = true;
      out.lt = f.lessThan;
    }
    if (ObjectUtils.isDefined(f.lessOrEqualThan)) {
      something = true;
      out.lte = f.lessOrEqualThan;
    }
    if (ObjectUtils.isDefined(f.like)) {
      something = true;
      out.like = valueTransformer(f.like);
    }
    if (ObjectUtils.isDefined(f.notLike)) {
      something = true;
      out.nlike = valueTransformer(f.notLike);
    }

    return something ? out : undefined;
  }
}
