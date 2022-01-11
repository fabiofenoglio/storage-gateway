import {AbstractBackbone} from '../../models/proto/abstract-backbone.model';

export abstract class AbstractBackboneManagerService<
  T extends AbstractBackbone,
> {
  abstract get typeCode(): string;

  abstract get enabled(): boolean;

  abstract list(): Promise<T[]>;

  abstract findById(id: number): Promise<T | undefined>;
}
