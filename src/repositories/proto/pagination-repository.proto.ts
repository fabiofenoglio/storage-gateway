import {
  DefaultTransactionalRepository,
  Entity,
  Filter,
  juggler,
  Options,
} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {DbDataSource} from '../../datasources';
import {Page, Pageable} from '../../models/pagination/pagination.model';

export type PaginationFilter<T extends Entity> = Omit<
  Filter<T>,
  'limit' | 'skip' | 'offset'
> &
  Required<Pick<Filter<T>, 'order'>>;

export class PaginationRepository<
  T extends Entity,
  ID,
  Relations extends object = {},
> extends DefaultTransactionalRepository<T, ID, Relations> {
  private rootEntityClass: {
    prototype: T;
    new (data?: Partial<T>): T;
  };

  constructor(
    rootEntityClass: typeof Entity & {
      prototype: T;
      new (data?: Partial<T>): T;
    },
    dataSource: juggler.DataSource,
  ) {
    super(rootEntityClass, dataSource);
    this.rootEntityClass = rootEntityClass;
  }

  public instantiate(data?: Partial<T>): T {
    return new this.rootEntityClass(data);
  }

  public async inTransaction<X>(
    fn: (tx: juggler.Transaction) => Promise<X>,
    existing: juggler.Transaction | undefined = undefined,
  ): Promise<X> {
    return (this.dataSource as DbDataSource).inTransaction(fn, existing);
  }

  public async findPage(
    filter: PaginationFilter<T>,
    pageRequest: Pageable,
    options?: Options,
  ): Promise<Page<T & Relations>> {
    const requestedPage = pageRequest.page ?? 0;
    const requestedSize = pageRequest.size ?? undefined;
    const isPaged = typeof requestedSize !== 'undefined' && requestedSize > 0;

    if (typeof requestedSize !== 'undefined' && requestedSize < 1) {
      throw new HttpErrors.BadRequest('Bad page size');
    }
    if (typeof requestedPage !== 'undefined' && requestedPage < 0) {
      throw new HttpErrors.BadRequest('Bad page nnumber');
    }

    const output: Page<T & Relations> = {
      content: [],
      numberOfElements: 0,
      totalElements: 0,
      totalPages: 0,
      number: requestedPage,
      size: requestedSize,
      hasContent: false,
      hasNext: false,
      hasPrevious: false,
      isFirst: true,
      isLast: true,
    };

    // do COUNT query
    const countResult = await this.count(filter?.where, options);
    if (countResult.count <= 0) {
      return output;
    }

    const totalPages = isPaged
      ? Math.ceil(countResult.count / requestedSize!)
      : 1;

    // do FETCH query
    const limit = isPaged ? requestedSize : undefined;
    const skip = isPaged ? requestedPage * requestedSize! : undefined;

    const fetchResult = await this.find(
      {
        ...filter,
        limit,
        skip,
      },
      options,
    );

    output.totalElements = countResult.count;
    output.totalPages = totalPages;
    output.content = fetchResult;
    output.numberOfElements = fetchResult.length;
    output.hasContent = fetchResult.length > 0;
    output.hasNext = isPaged ? requestedPage < totalPages - 1 : false;
    output.hasPrevious = isPaged ? requestedPage > 0 : false;
    output.isLast = isPaged ? requestedPage >= totalPages - 1 : true;
    output.isFirst = isPaged ? requestedPage <= 0 : true;

    return output;
  }
}
