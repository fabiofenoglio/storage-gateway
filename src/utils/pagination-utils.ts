import {Page, Pageable} from '../models';

const DEFAULT_PAGE_SIZE = 100;

export abstract class PaginationUtils {
  public static parsePagination(
    page: number | undefined,
    size: number | undefined,
  ): Pageable {
    return {
      page: page ?? 0,
      size: size ?? DEFAULT_PAGE_SIZE,
    };
  }

  public static defaultPage(): Pageable {
    return {
      page: 0,
      size: DEFAULT_PAGE_SIZE,
    };
  }

  public static unpaged(): Pageable {
    return {
      page: 0,
      size: undefined,
    };
  }

  public static emptyPage<T>(pageable?: Pageable): Page<T> {
    const output: Page<T> = {
      content: [],
      numberOfElements: 0,
      totalElements: 0,
      totalPages: 0,
      number: pageable?.page ?? 0,
      size: pageable?.size,
      hasContent: false,
      hasNext: false,
      hasPrevious: false,
      isFirst: true,
      isLast: true,
    };
    return output;
  }

  public static toPage<T>(input: T[]): Page<T> {
    const output: Page<T> = {
      content: input,
      numberOfElements: input.length,
      totalElements: input.length,
      totalPages: 1,
      number: 0,
      size: input.length,
      hasContent: true,
      hasNext: false,
      hasPrevious: false,
      isFirst: true,
      isLast: true,
    };
    return output;
  }
}
