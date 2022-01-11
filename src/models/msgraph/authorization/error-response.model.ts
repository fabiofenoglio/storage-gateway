/* eslint-disable @typescript-eslint/no-explicit-any */

export class MsGraphErrorResponse {
  error: string;
  errorDescription?: string;
  errorCodes?: number[];
  timestamp?: string;
  traceId?: string;
  correlationId?: string;
  errorUri?: string;

  constructor(data: any) {
    if (data && data instanceof MsGraphErrorResponse) {
      Object.assign(this, data);
    } else {
      Object.assign(this, {
        error: data['error'],
        errorDescription: data['error_description'],
        errorCodes: data['error_codes'],
        timestamp: data['timestamp'],
        traceId: data['trace_id'],
        correlationId: data['correlationId'],
        errorUri: data['errorUri'],
      });
    }
  }
}
