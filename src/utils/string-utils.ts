/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/prefer-for-of */
export abstract class StringUtils {
  public static format(
    raw: string,
    fields?: {[key: string]: any} | null,
    compute?: (key: string) => any,
  ): string {
    if (!fields) {
      if (!compute) {
        throw new Error(
          'No fields specification and no compute function provided',
        );
      }

      // dynamic
      const placeholders =
        [...raw.matchAll(/\$\{\s*([^\}\:\s]+)\s*\:?\s*([^\}]+\s*)?\s*\}/g)] ??
        [];
      if (!placeholders.length) {
        return raw;
      }

      fields = {};
      for (const placeholder of placeholders) {
        const matchGroups = placeholder;
        const numGroups = matchGroups?.length ?? 0;
        if (numGroups < 2) {
          throw new Error('Invalid placeholder format: ' + matchGroups![1]);
        }

        const hasDefaultValue =
          numGroups >= 3 &&
          matchGroups![2] !== null &&
          typeof matchGroups![2] !== 'undefined';
        const key = matchGroups![1].trim();
        const defaultValue = hasDefaultValue ? matchGroups![2].trim() : null;

        let computed: string | null = compute(key);
        if (computed === '') {
          computed = null;
        } else {
          if (computed === null || typeof computed === 'undefined') {
            if (hasDefaultValue) {
              computed = defaultValue;
            } else {
              throw new Error('Missing required environment variable ' + key);
            }
          }
        }
        fields[matchGroups![0]] = computed;
      }
    }

    let output = raw;
    for (const [k, v] of Object.entries(fields)) {
      let effectiveValue = v;
      const placeholder = k.trim().startsWith('${') ? k : '${' + k + '}';
      let cached: any = null;
      let cacheComputed = false;
      while (output.indexOf(placeholder) !== -1) {
        if (cacheComputed) {
          effectiveValue = cached;
        } else if (typeof v === 'function') {
          cached = v(k);
          cacheComputed = true;
          effectiveValue = cached;
        }
        output = output.replace(placeholder, effectiveValue);
      }
    }
    if (output.indexOf('${') !== -1) {
      throw new Error('Not all arguments provided to format string');
    }
    return output;
  }

  public static extract(raw: string, format: string): {[key: string]: string} {
    const output: {[key: string]: string} = {};

    const placeholders = format.match(/\$\{([^\}]+)\}/g) ?? [];
    if (!placeholders.length) {
      return output;
    }

    const groupNames = placeholders.map(p => p.substr(2, p.length - 3));

    const pmap = groupNames.map(p => '(?<' + p + '>.*)');
    const sep = '________________________';

    let repl = format;
    for (let i = 0; i < placeholders.length; i++) {
      repl = repl.replace(placeholders[i], sep + i + sep);
    }

    repl = repl.replace(/([^a-zA-Z0-9_])/g, '\\$1');

    for (let i = 0; i < placeholders.length; i++) {
      repl = repl.replace(sep + i + sep, pmap[i]);
    }

    const regex = new RegExp(repl);
    const matchresult = raw.match(regex) ?? [];

    if (matchresult.length === placeholders.length + 1 && matchresult.groups) {
      for (let i = 0; i < groupNames.length; i++) {
        output[groupNames[i]] = matchresult.groups[groupNames[i]];
      }
    } else {
      throw new Error('String does not match provided format');
    }

    return output;
  }
}
