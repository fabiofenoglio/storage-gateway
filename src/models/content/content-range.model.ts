export interface RequestedContentRange {
  start: number;
  end: number;
  text: string;
}

export interface RetrievedContentRange {
  start: number;
  end: number;
  text: string;
  declaredSize?: number;
}
