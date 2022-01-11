import {BindingScope, inject, injectable} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {LoggerBindings} from '../key';

export interface MetricsSnapshot {
  externalCallsNumber: number;
  externalReadNumber: number;
  externalWriteNumber: number;
  externalWriteWithDataNumber: number;
  externalReadWithDataNumber: number;
}

@injectable({scope: BindingScope.SINGLETON})
export class MetricService {
  private metrics: MetricsSnapshot = {
    externalCallsNumber: 0,
    externalReadNumber: 0,
    externalWriteNumber: 0,
    externalWriteWithDataNumber: 0,
    externalReadWithDataNumber: 0,
  };

  private lastReturned?: MetricsSnapshot;

  constructor(
    @inject(LoggerBindings.ROOT_LOGGER) private logger: WinstonLogger,
  ) {}

  public get(): MetricsSnapshot {
    const out = {
      ...this.metrics,
    };
    this.lastReturned = {
      ...out,
    };
    return this.lastReturned;
  }

  public delta(lastinput?: MetricsSnapshot): MetricsSnapshot {
    const last = (lastinput ?? this.lastReturned) as
      | {[key: string]: number}
      | undefined;

    const current: {[key: string]: number} = {
      ...this.get(),
    };

    const out: {[key: string]: number} = {};
    for (const k of Object.keys(this.metrics)) {
      const v = (current[k] as number) - (last ? last[k] ?? 0 : 0);
      out[k] = v;
    }

    return out as unknown as MetricsSnapshot;
  }

  public registerExternalRead(): void {
    this.metrics.externalCallsNumber++;
    this.metrics.externalReadNumber++;
    this.logEvent('registerExternalRead');
  }

  public registerExternalWrite(): void {
    this.metrics.externalCallsNumber++;
    this.metrics.externalWriteNumber++;
    this.logEvent('registerExternalWrite');
  }

  public registerExternalReadWithData(): void {
    this.metrics.externalCallsNumber++;
    this.metrics.externalReadNumber++;
    this.metrics.externalReadWithDataNumber++;
    this.logEvent('registerExternalReadWithData');
  }

  public registerExternalWriteWithData(): void {
    this.metrics.externalCallsNumber++;
    this.metrics.externalWriteNumber++;
    this.metrics.externalWriteWithDataNumber++;
    this.logEvent('registerExternalWriteWithData');
  }

  private logEvent(event: string): void {
    // this.logger.debug('metrics event metrics::' + event);
  }
}
