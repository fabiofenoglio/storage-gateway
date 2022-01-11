export interface Page<T> {
  content: T[];
  numberOfElements: number;
  totalElements: number;
  totalPages: number;
  number: number;
  hasContent: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  isFirst: boolean;
  isLast: boolean;
  size?: number;
}

export interface Pageable {
  page?: number;
  size?: number;
}
