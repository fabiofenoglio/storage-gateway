/* eslint-disable @typescript-eslint/no-explicit-any */
export class MsGraphPageResponse<T> {
  count?: number;
  nextLink?: string;
  value: T[];

  constructor(
    data: any,
    itemFactory: ((row: any) => T) | undefined = undefined,
  ) {
    if (data && data instanceof MsGraphPageResponse) {
      Object.assign(this, data);
    } else {
      Object.assign(this, {
        count: data['@odata.count'],
        nextLink: data['@odata.nextLink'],
        value: itemFactory
          ? ((data['value'] as any[]) ?? []).map(r => itemFactory(r))
          : ((data['value'] as any[]) ?? []).map(r =>
              msGraphPageResponseDefaultItemFactory(r),
            ),
      });
    }
    if (!this.value?.length) {
      this.value = [];
    }
  }
}

const msGraphPageResponseDefaultItemFactory = (row: any) => {
  const out: any = {};
  const odataProperties = [];
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('@')) {
      odataProperties.push({
        key: k,
        value: v,
      });
    } else {
      out[k] = v;
    }
  }
  out['odata'] = odataProperties;
  return out;
};
