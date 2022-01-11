import {WinstonLogger} from '@loopback/logging';
import {HttpErrors, Request, Response} from '@loopback/rest';
import fresh from 'fresh';
import http from 'http';
import https from 'https';
import {Readable} from 'stream';
import {v4 as uuidv4} from 'uuid';
import {DeferredContentRetriever} from '../models/content/content-models.model';
import {
  RequestedContentRange,
  RetrievedContentRange,
} from '../models/content/content-range.model';
import {ContentStreamer} from '../models/content/content-streamer.model';
import {ObjectUtils} from './object-utils';
import {StreamUtils} from './stream-utils';

export abstract class RequestUtils {
  private static RANGE_REQUEST_REGEX =
    /^\s*bytes\s*=\s*([0-9]*)\s*-\s*([0-9]*)\s*$/i;
  private static RANGE_RESPONSE_REGEX =
    /^\s*bytes\s+([0-9]*)\s*-\s*([0-9]*)\s*\/?\s*([\d]*|\*)\s*$/i;

  public static parse<T>(raw: T | string): T {
    if (raw === null || typeof raw === 'undefined') {
      return raw;
    } else if (typeof raw === 'string') {
      return JSON.parse(raw) as T;
    } else {
      return raw;
    }
  }

  public static async serveContentHead(
    logger: WinstonLogger,
    data: DeferredContentRetriever,
    request: Request,
    response: Response,
  ): Promise<Response | undefined | void> {
    return this.serveContent(logger, data, request, response, true);
  }

  public static async serveContent(
    logger: WinstonLogger,
    data: DeferredContentRetriever,
    request: Request,
    response: Response,
    head = false,
  ): Promise<Response | undefined | void> {
    const contentDownloadMetadata = this.extractRequestContext(data);
    logger.debug(
      'serving content asset/provider to response',
      contentDownloadMetadata,
    );

    const etagReq = request.header('if-none-match');
    if (etagReq) {
      logger.debug(
        `content was requested with conditional if-none-match = ${etagReq}, current eTag is ${contentDownloadMetadata.etag}`,
      );
    }

    let isFresh = false;
    if (contentDownloadMetadata.etag) {
      isFresh = fresh(request.headers, {
        etag: contentDownloadMetadata.etag,
      });
      if (isFresh) {
        logger.debug(
          'content was determined to be "fresh" from content manager',
        );
      }
    }

    if (isFresh) {
      logger.debug('returning status 304 - unchanged as content is fresh.');
      response.writeHead(304, {
        ETag: contentDownloadMetadata.etag,
        'X-Served-From': `fresh`,
      });
      response.end();
      return undefined;
    }

    let content: ContentStreamer | null = null;

    if (!head) {
      if ((data as Partial<DeferredContentRetriever>).contentProvider) {
        logger.debug('invoking content provider');
        content = await data.contentProvider();
        logger.debug('invoked content provider');
      } else {
        throw new Error('No content provided');
      }
    }

    if (!head && !content?.hasContent) {
      throw new HttpErrors.InternalServerError('Content could not be located.');
    }

    if (content?.hasUrl) {
      logger.debug(
        'content is to be served from external URL, serving via redirect',
      );
      // special case: redirect
      return this.serveContentFromExternalLocation(
        logger,
        data,
        content,
        request,
        response,
        head,
      );
    }

    let streamOpener: ((range?: [number, number]) => Promise<Readable>) | null =
      null;

    logger.debug('content is to be served from stream provider delegate');
    streamOpener = (range?: [number, number]) => content!.stream(range);

    if (!head && !streamOpener) {
      throw new HttpErrors.InternalServerError('Content could not be served.');
    }

    const responseHeaders = RequestUtils.buildResponseHeaders(data);

    let inputStream: Readable | null = null;
    let status: number;

    const rangeRequest = this.validateRangeRequest(
      logger,
      request,
      data.contentSize,
    );

    let openStreamExtremis: [number, number] | null = null;

    if (rangeRequest) {
      // received ranged request but fetched whole buffer
      logger.debug(
        'content was required as ranged but was provided as generic unranged stream. Stream provider will be invoked with selected range',
      );
      logger.debug('content was required with range', rangeRequest);

      const {start, end} = rangeRequest;
      status = 206;
      let contentRangeHeader = `bytes ${start}-${end}`;
      if (data.contentSize) {
        contentRangeHeader += `/${data.contentSize}`;
      }
      responseHeaders['Content-Range'] = contentRangeHeader;
      responseHeaders['Content-Length'] = end - start + 1 + '';

      openStreamExtremis = [start, end];
    } else {
      // request is not ranged, returning whole body
      logger.debug('request is not ranged, the whole content will be returned');
      status = 200;
    }

    if (!head) {
      logger.verbose('opening content read stream');
      if (openStreamExtremis) {
        logger.verbose(
          'opening content read stream with sub-extremis',
          openStreamExtremis,
        );
      }
      try {
        inputStream = await streamOpener!(openStreamExtremis ?? undefined);
      } catch (err) {
        logger.error('error opening stream for response', err);
        response.writeHead(500);
        response.write('internal error');
        response.end();
        return;
      }
      logger.verbose('opened content read stream');
    }

    logger.debug('returning status ' + status);
    for (const responseHeaderKey of Object.keys(responseHeaders)) {
      logger.debug(
        `writing header ${responseHeaderKey} = ${responseHeaders[responseHeaderKey]}`,
      );
    }

    response.writeHead(status, responseHeaders);

    if (inputStream) {
      try {
        logger.debug('piping opened content stream to response');
        const piped = StreamUtils.pipeWithErrors(inputStream, response);
        piped.on('error', err => {
          logger.error('stream error #1 writing response', err);
          response.connection.destroy();
        });
      } catch (err) {
        logger.error('error writing response', err);
        response.connection.destroy();
      }
    } else {
      logger.debug('no content stream to serve, ending response');
      response.end();
    }

    return undefined;
  }

  private static buildResponseHeaders(data: DeferredContentRetriever) {
    const contentDownloadMetadata = this.extractRequestContext(data);

    const responseHeaders: {[key: string]: string} = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'max-age=0',
      ETag: contentDownloadMetadata.etag,
      'Content-Disposition': contentDownloadMetadata.contentDisposition,
      'Content-Type': contentDownloadMetadata.contentType,
      'X-Served-From': `fs-stream`,
    };

    if (data.contentSize) {
      responseHeaders['Content-Length'] = data.contentSize + '';
    }

    return responseHeaders;
  }

  private static extractRequestContext(data: DeferredContentRetriever): {
    etag: string;
    fileName: string;
    contentType: string;
    contentDisposition: string;
  } {
    const etag = data.contentETag ?? 'W/"' + uuidv4() + '"';
    const fileName = data.fileName ?? 'content.bin';
    const contentType = data.mimeType ?? 'application/octet-stream';
    return {
      etag,
      fileName,
      contentType,
      contentDisposition: `inline; filename="${fileName}"`,
    };
  }

  private static serveContentFromExternalLocation(
    logger: WinstonLogger,
    data: DeferredContentRetriever,
    content: ContentStreamer,
    request: Request,
    response: Response,
    head: boolean,
  ) {
    if (!content.hasUrl) {
      throw new Error('Data location is required');
    }

    this.validateRangeRequest(logger, request, data.contentSize!);

    logger.debug(
      'returning status 302 - redirect to external url ' + content.location,
    );

    response.writeHead(302, {
      Location: content.location,
      'X-Served-From': `redirect`,
    });
    response.end();
    return undefined;
  }

  public static toRetrievedRange(rawHeader: string): RetrievedContentRange {
    /*
      accepted formats as of RFC:

      Content-Range: <unit> <range-start>-<range-end>/<size>
      Content-Range: <unit> <range-start>-<range-end>/<asterisk>
      Content-Range: <unit> <asterisk>/<size>

      asterisk in the first section are not considered
      because they mark a non-partial response.
    */
    const match = rawHeader.match(this.RANGE_RESPONSE_REGEX);
    if (!match?.length || match.length < 3) {
      throw new HttpErrors.InternalServerError(
        'Invalid retrievd range from remote: ' + rawHeader,
      );
    }
    let declaredSize = undefined;
    if (match[3]?.length && !match[3].includes('*')) {
      declaredSize = parseInt(match[3], 10);
    }
    return {
      text: rawHeader,
      start: parseInt(match[1], 10),
      end: parseInt(match[2], 10),
      declaredSize,
    };
  }

  public static validateRangeRequest(
    // NOSONAR
    logger: WinstonLogger,
    request: Request,
    contentSize: number | null | undefined,
  ): RequestedContentRange | undefined {
    if (request.headers['range']) {
      // received ranged request
      const rawHeader = request.headers['range'];
      logger.debug(`request has range header ${rawHeader}`);

      const match = rawHeader.match(this.RANGE_REQUEST_REGEX);
      if (match?.length !== 3) {
        logger.error('invalid range requested: ' + rawHeader);
        throw new HttpErrors.RangeNotSatisfiable(
          'Invalid range requested: ' + rawHeader,
        );
      }

      const size = contentSize;
      const [startStr, endStr] = [match[1], match[2]];
      let start = startStr ? parseInt(startStr, 10) : 0;
      let end = endStr ? parseInt(endStr, 10) : size ? size - 1 : undefined;

      logger.debug(`raw requested range is ${start} - ${end} over ${size}`);

      if (size) {
        if (!isNaN(start) && isNaN(end!)) {
          end = size - 1;
        }
        if (isNaN(start) && !isNaN(end!)) {
          start = size - end!;
          end = size - 1;
        }

        // Handle unavailable range request
        if (start >= size || (end && end >= size) || (end && start > end)) {
          // Return the 416 Range Not Satisfiable.

          logger.error(
            'invalid range requested: start ' +
              start +
              ', end ' +
              end +
              ', over ' +
              size +
              ' bytes',
          );
          throw new HttpErrors.RangeNotSatisfiable(
            'Invalid range requested: start ' +
              start +
              ', end ' +
              end +
              ', over ' +
              size +
              ' bytes',
          );
        }
      }

      if (!end) {
        logger.error('invalid range requested: upper bound not provided');
        throw new HttpErrors.RangeNotSatisfiable('Upper bound not provided');
      }

      const out = {
        start,
        end,
        // text: rawHeader
        text: RequestUtils.toPartialRequestByteHeader(start, end),
      };

      logger.debug(
        `parsed requested range is ${out.start} - ${out.end}, expressed as ${out.text}`,
      );

      return out;
    }
    return undefined;
  }

  public static toPartialRequestByteHeader(
    start: number,
    end?: number,
  ): string {
    return 'bytes=' + start + '-' + (end ?? '*');
  }

  // TODO MOVE IN STREAM UTILS
  public static readStreamFromURL(urlStr: string, range?: number[]): Readable {
    // NOSONAR
    if (!urlStr) {
      throw new Error('A valid URL is required to read from');
    }
    const executor = urlStr.startsWith('https:') ? https : http;
    const outputStream = new Readable({
      read() {
        // NOP read method
      },
    });

    const headers: http.OutgoingHttpHeaders = {};
    const isRanged = !!range?.length;

    if (isRanged) {
      headers['Range'] =
        'bytes=' + range![0] + '-' + (range!.length > 1 ? range![1] : '*');
    }

    executor
      .get(
        urlStr,
        {
          headers,
        },
        (res: http.IncomingMessage) => {
          let consumeNoOp = false;
          try {
            if ((res.statusCode ?? 0) >= 400) {
              // 400 or upper are errors
              throw new Error(
                'Remote server returned status ' +
                  res.statusCode +
                  ' - ' +
                  res.statusMessage,
              );
            } else if ((res.statusCode ?? 0) >= 300) {
              // redirect
              const location = res.headers.location;
              if (location) {
                const otherStream = this.readStreamFromURL(location, range);
                otherStream.on('data', data => outputStream.push(data));
                otherStream.on('error', data =>
                  outputStream.emit('error', data),
                );
                otherStream.on('end', () => outputStream.push(null));

                // consume current response stream in NO-OP
                consumeNoOp = true;
              } else {
                throw new Error(
                  'Remote server returned status ' +
                    res.statusCode +
                    ' - ' +
                    res.statusMessage,
                );
              }
            } else {
              // check if received a ranged response if expected
              if (isRanged) {
                if (res.headers['accept-ranges'] !== 'bytes') {
                  throw new Error(
                    'A Ranged request was attempted to a server that does not declare Range support',
                  );
                }
                const contentRangeResponseHeader = res.headers['content-range'];
                if (!contentRangeResponseHeader) {
                  throw new Error(
                    'A Ranged request was attempted but the server did not explicit the returned range',
                  );
                }
                if (
                  !contentRangeResponseHeader.startsWith(
                    'bytes ' + range![0] + '-',
                  )
                ) {
                  throw new Error(
                    'A Ranged request was attempted but the server returned a wrong range',
                  );
                }
              }
            }
          } catch (err) {
            outputStream.emit('error', err);

            // consume current response stream in NO-OP
            consumeNoOp = true;
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          res.on('data', (data: any) => {
            if (!consumeNoOp) outputStream.push(data);
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          res.on('error', (error: any) => {
            if (!consumeNoOp) outputStream.emit('error', error);
          });
          res.on('end', () => {
            if (!consumeNoOp) outputStream.push(null);
          });
        },
      )
      .on('error', e => {
        outputStream.emit('error', e);
      })
      .end();

    return outputStream;
  }

  public static readFromURL(
    urlStr: string,
    options?: {
      method?: string;
      dropResponseBody?: boolean;
    },
  ): Promise<{
    message: http.IncomingMessage;
    body: Buffer;
  }> {
    const method = options?.method ?? 'GET';
    const dropResponseBody = options?.dropResponseBody ?? false;

    if (!urlStr) {
      throw new Error('A valid URL is required to read from');
    }
    const executor = urlStr.startsWith('https:') ? https : http;
    const headers: http.OutgoingHttpHeaders = {};

    let response: http.IncomingMessage | null = null;
    let responseBody: Buffer = Buffer.from([]);

    return new Promise((resolve, rej) => {
      try {
        executor
          .request(
            urlStr,
            {
              method,
              headers,
            },
            (res: http.IncomingMessage) => {
              try {
                response = res;
                let redirected = false;
                const status = res.statusCode ?? 0;
                if (status >= 300 && status <= 303) {
                  // redirect
                  const location = res.headers.location;
                  if (location) {
                    // read from other resource
                    redirected = true;
                    const otherCall = this.readFromURL(location, options);
                    otherCall.then(
                      otherOk => resolve(otherOk),
                      otherErr => rej(otherErr),
                    );
                  }
                } else {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  res.on('data', (data: any) => {
                    if (!dropResponseBody) {
                      responseBody = responseBody + data;
                    }
                  });
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  res.on('error', (error: any) => {
                    if (!redirected) {
                      rej(error);
                    }
                  });
                  res.on('end', () => {
                    if (!redirected) {
                      resolve({
                        message: response!,
                        body: responseBody,
                      });
                    }
                  });
                }
              } catch (err2) {
                rej(err2);
              }
            },
          )
          .on('error', e => {
            rej(e);
          })
          .end();
      } catch (err) {
        rej(err);
      }
    });
  }

  public static rangeMatches(
    requested: {start: number; end: number},
    retrieved: RetrievedContentRange,
  ): boolean {
    return (
      !ObjectUtils.isNull(requested.start) &&
      !ObjectUtils.isNull(requested.end) &&
      !ObjectUtils.isNull(retrieved.start) &&
      !ObjectUtils.isNull(retrieved.end) &&
      retrieved.start === requested.start &&
      retrieved.end === requested.end
    );
  }
}
