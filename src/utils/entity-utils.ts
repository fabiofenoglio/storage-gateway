/* eslint-disable @typescript-eslint/prefer-for-of */
export abstract class EntityUtils {
  public static compareLists<A, B>(
    list1: A[] | undefined,
    list2: B[] | undefined,
    matcher: (a: A, b: B) => boolean,
  ): {
    inFirstNotInSecond: A[];
    inSecondNotInFirst: B[];
    inBothFromFirst: A[];
    inBothFromSecond: B[];
    inBoth: {first: A; second: B}[];
  } {
    const output: {
      inFirstNotInSecond: A[];
      inSecondNotInFirst: B[];
      inBothFromFirst: A[];
      inBothFromSecond: B[];
      inBoth: {first: A; second: B}[];
    } = {
      inFirstNotInSecond: [],
      inSecondNotInFirst: [],
      inBothFromFirst: [],
      inBothFromSecond: [],
      inBoth: [],
    };

    list1 = list1 ?? [];
    list2 = list2 ?? [];

    for (let i1 = 0; i1 < list1.length; i1++) {
      const el1 = list1[i1];
      if (!el1) {
        continue;
      }
      let el2 = null;
      let found = false;
      for (let i2 = 0; i2 < list2.length; i2++) {
        el2 = list2[i2];
        if (!el2) {
          continue;
        }
        if (matcher(el1, el2)) {
          found = true;
          break;
        }
      }
      if (found) {
        output.inBothFromFirst.push(el1);
        output.inBothFromSecond.push(el2!);
        output.inBoth.push({first: el1, second: el2!});
      } else {
        output.inFirstNotInSecond.push(el1);
      }
    }

    for (let i2 = 0; i2 < list2.length; i2++) {
      const el2 = list2[i2];
      let el1 = null;
      let found = false;
      for (let i1 = 0; i1 < list1.length; i1++) {
        el1 = list1[i1];
        if (matcher(el1, el2)) {
          found = true;
          break;
        }
      }
      if (!found) {
        output.inSecondNotInFirst.push(el2);
      }
    }

    return output;
  }
}
