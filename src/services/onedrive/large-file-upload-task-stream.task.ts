/* eslint-disable no-constant-condition */
/* eslint-disable no-useless-catch */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {WinstonLogger} from '@loopback/logging';
import {
  Client,
  LargeFileUploadSession,
  LargeFileUploadTaskOptions,
} from '@microsoft/microsoft-graph-client';
import {Readable} from 'stream';
import {sleep} from '../../utils';

/**
 * @interface
 * Signature to define the properties and content of the file in upload task
 * @property {Readable} contentStream - The actual content as a Readable / Stream interface
 * @property {(start: number, end: number) => Readable} contentProvider - An alternative provider for the content slice as a Readable / Stream interface
 * @property {string} name - Specifies the file name with extension
 * @property {number} size - Specifies size of the file
 */
export interface StreamableObject {
  contentStream?: Readable;
  contentProvider?: (start: number, end: number) => Readable;
  name: string;
  size: number;
}

/**
 * @interface
 * Signature to define options for a stream upload task
 * @property {(range: Range) => void} [uploadingSliceCallback] - Callback for each slice upload
 */
export interface LargeFileStreamUploadTaskOptions
  extends LargeFileUploadTaskOptions {
  uploadingSliceCallback?: (range: Range) => void;
}

interface KeyValuePairObjectStringNumber {
  [key: string]: string | number;
}

interface UploadStatusResponse {
  expirationDateTime: string;
  nextExpectedRanges: string[];
}

/**
 * @class
 * Class representing LargeFileUploadStreamTask
 */
export class LargeFileUploadStreamTask {
  /**
   * @private
   * Default value for the rangeSize
   */
  private DEFAULT_FILE_SIZE: number = 16 * 327680;

  /**
   * @protected
   * The GraphClient instance
   */
  protected client: Client;

  /**
   * @protected
   * The object holding file details
   */
  protected file: StreamableObject;

  /**
   * @protected
   * The object holding options for the task
   */
  protected options: LargeFileStreamUploadTaskOptions;

  /**
   * @protected
   * The object for upload session
   */
  protected uploadSession: LargeFileUploadSession;

  /**
   * @protected
   * The next range needs to be uploaded
   */
  protected nextRange: Range;

  private logger: WinstonLogger;

  private lastFetchedRange: Range | null = null;
  private lastFetchedData: ArrayBuffer | Blob | null = null;

  /**
   * @public
   * @static
   * @async
   * Makes request to the server to create an upload session
   * @param {Client} client - The GraphClient instance
   * @param {any} payload - The payload that needs to be sent
   * @param {KeyValuePairObjectStringNumber} headers - The headers that needs to be sent
   * @returns The promise that resolves to LargeFileUploadSession
   */
  public static async createUploadSession(
    client: Client,
    requestUrl: string,
    payload: any,
    headers: KeyValuePairObjectStringNumber = {},
  ): Promise<any> {
    try {
      const session = await client
        .api(requestUrl)
        .headers(headers)
        .post(payload);
      const largeFileUploadSession: LargeFileUploadSession = {
        url: session.uploadUrl,
        expiry: new Date(session.expirationDateTime),
      };
      return largeFileUploadSession;
    } catch (err) {
      throw err;
    }
  }

  /**
   * @public
   * @constructor
   * Constructs a LargeFileUploadTask
   * @param {Client} client - The GraphClient instance
   * @param {StreamableObject} file - The StreamableObject holding details of a file that needs to be uploaded
   * @param {LargeFileUploadSession} uploadSession - The upload session to which the upload has to be done
   * @param {LargeFileStreamUploadTaskOptions} options - The upload task options
   * @returns An instance of LargeFileUploadTask
   */
  public constructor(
    logger: WinstonLogger,
    client: Client,
    file: StreamableObject,
    uploadSession: LargeFileUploadSession,
    options: LargeFileStreamUploadTaskOptions = {},
  ) {
    this.logger = logger;
    this.client = client;
    this.file = file;
    if (options.rangeSize === undefined) {
      options.rangeSize = this.DEFAULT_FILE_SIZE;
    }
    this.options = options;
    this.uploadSession = uploadSession;
    this.nextRange = new Range(
      0,
      (this.options?.rangeSize ?? this.DEFAULT_FILE_SIZE) - 1,
    );
  }

  /**
   * @private
   * Parses given range string to the Range instance
   * @param {string[]} ranges - The ranges value
   * @returns The range instance
   */
  private parseRange(ranges: string[]): Range {
    const rangeStr = ranges[0];
    if (typeof rangeStr === 'undefined' || rangeStr === '') {
      return new Range();
    }
    const firstRange = rangeStr.split('-');
    const minVal = parseInt(firstRange[0], 10);
    let maxVal = parseInt(firstRange[1], 10);
    if (Number.isNaN(maxVal)) {
      maxVal = this.file.size - 1;
    }
    return new Range(minVal, maxVal);
  }

  /**
   * @private
   * Updates the expiration date and the next range
   * @param {UploadStatusResponse} response - The response of the upload status
   * @returns Nothing
   */
  private updateTaskStatus(response: UploadStatusResponse): void {
    this.uploadSession.expiry = new Date(response.expirationDateTime);
    this.nextRange = this.parseRange(response.nextExpectedRanges);
  }

  /**
   * @public
   * Gets next range that needs to be uploaded
   * @returns The range instance
   */
  public getNextRange(): Range {
    if (this.nextRange.minValue === -1) {
      return this.nextRange;
    }
    const minVal = this.nextRange.minValue;
    let maxValue =
      minVal + (this.options?.rangeSize ?? this.DEFAULT_FILE_SIZE) - 1;
    if (maxValue >= this.file.size) {
      maxValue = this.file.size - 1;
    }
    return new Range(minVal, maxValue);
  }

  /**
   * @public
   * Slices the file content to the given range
   * @param {Range} range - The range value
   * @returns The sliced ArrayBuffer or Blob
   */
  public async sliceFile(range: Range): Promise<ArrayBuffer | Blob> {
    // check if cached
    if (
      this.lastFetchedRange?.minValue &&
      this.lastFetchedRange?.maxValue &&
      range.minValue &&
      range.maxValue &&
      range.minValue === this.lastFetchedRange.minValue &&
      range.maxValue === this.lastFetchedRange.maxValue
    ) {
      this.logger.debug('cache HIT for fetched data (reusing last slice)');
      return this.lastFetchedData!;
    }

    if (this.file.contentStream) {
      if (!this.file.contentStream.isPaused) {
        throw new Error('ContentStream should be paused.');
      }

      // read data from the stream
      const inputStream = this.file.contentStream;
      const bytesToRead = range.maxValue - range.minValue + 1;
      this.logger.debug(`waiting for input stream to be readable for`, range);

      let chunk: Buffer | null;
      while (null === (chunk = inputStream.read(bytesToRead))) {
        this.logger.debug(`waiting for ${bytesToRead} bytes of data.`);
        await new Promise(fulfill => {
          setTimeout(() => fulfill(true), 100);
        });
      }
      this.logger.debug(`received ${chunk.length} bytes of data.`);
      this.lastFetchedRange = {
        ...range,
      };
      this.lastFetchedData = chunk;
      return chunk;
    } else if (this.file.contentProvider) {
      // ask for data from contentProvider
      const stream = this.file.contentProvider(range.minValue, range.maxValue);

      const loadedBuffer = await new Promise((fulfill, reject) => {
        const bufs: Buffer[] = [];
        stream.on('data', d => bufs.push(d));
        stream.on('end', () => {
          fulfill(Buffer.concat(bufs));
        });
        stream.on('error', err => {
          reject(err);
        });
      });

      const chunk = this.toArrayBuffer(loadedBuffer as Buffer);
      this.lastFetchedRange = {
        ...range,
      };
      this.lastFetchedData = chunk;
      return chunk;
    } else {
      throw new Error(
        'No content source provided. Please provide either contentStream or contentProvider.',
      );
    }
  }

  private toArrayBuffer(buf: Buffer): ArrayBuffer {
    const ab = new ArrayBuffer(buf.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < buf.length; ++i) {
      view[i] = buf[i];
    }
    return ab;
  }

  /**
   * @public
   * @async
   * Uploads file to the server in a sequential order by slicing the file
   * @returns The promise resolves to uploaded response
   */
  public async upload(): Promise<any> {
    this.logger.info(`starting chunked upload for ${this.file?.size} bytes`);
    let retryCounter = 0;

    try {
      while (true) {
        const nextRange = this.getNextRange();
        if (nextRange.maxValue === -1) {
          const err = new Error(
            'Task with which you are trying to upload is already completed, Please check for your uploaded file',
          );
          err.name = 'Invalid Session';
          throw err;
        }
        this.logger.debug(
          'retrieving slice ' + nextRange.minValue + ' - ' + nextRange.maxValue,
        );

        const fileSlice = await this.sliceFile(nextRange);
        if (this.options.uploadingSliceCallback) {
          this.options.uploadingSliceCallback(nextRange);
        }

        this.logger.debug(
          `uploading slice ${nextRange.minValue}-${nextRange.maxValue}/${this.file?.size}`,
        );

        let response: any = null;
        let sliceUploadSuccess = true;
        let retry = false;

        try {
          response = await this.uploadSlice(
            fileSlice,
            nextRange,
            this.file.size,
          );
        } catch (sliceUploadErr) {
          sliceUploadSuccess = false;
          this.logger.warn('error uploading current slice', sliceUploadErr);

          // check if retry is available. get status in read-only
          const canRetry = await this.canRetry(nextRange);

          if (canRetry) {
            if (retryCounter < 4) {
              // can retry
              retryCounter++;
              const sleepAmount = 250 * retryCounter;
              this.logger.debug(
                `retrying upload (retry num. ${retryCounter}) in ${sleepAmount} ms`,
              );
              retry = true;

              // wait with linear backoff
              await sleep(sleepAmount);
            } else {
              this.logger.warn('maximum number of retries reached. giving up');
            }
          }

          if (!retry) {
            throw sliceUploadErr;
          }
        }

        if (sliceUploadSuccess) {
          this.logger.debug(
            `uploaded slice ${nextRange.minValue}-${nextRange.maxValue}/${this.file?.size}`,
          );

          // on success, reset retry counter
          retryCounter = 0;

          // Upon completion of upload process incase of onedrive, driveItem is returned, which contains id
          if (response.id !== undefined) {
            return response;
          } else {
            this.updateTaskStatus(response);
          }
        }
      }
    } catch (err) {
      this.logger.error(`fatal error in chuncked upload`, err);
      try {
        const status = await this.getStatus();
        this.logger.debug(`current upload status is`, status);
      } catch (err2) {
        this.logger.warn(
          'additionally, could not retrieve upload status at failtime',
          err2,
        );
      }
      throw err;
    }
  }

  private async canRetry(currentRange: Range): Promise<boolean> {
    this.logger.debug('checking if current chunk upload can be retried.');
    const currentStatus = await this.getStatus(false);
    if (this.logger.isDebugEnabled()) {
      this.logger.debug(
        `current range is <${JSON.stringify(
          currentRange,
        )}>, remote status is <${JSON.stringify(
          currentStatus.nextExpectedRanges,
        )}>`,
      );
    }

    if (currentStatus?.nextExpectedRanges) {
      const expRange = this.parseRange(currentStatus.nextExpectedRanges);
      if (
        expRange?.minValue &&
        expRange.maxValue &&
        expRange.minValue === currentRange.minValue &&
        expRange.maxValue >= currentRange.maxValue
      ) {
        this.updateTaskStatus(currentStatus);
        return true;
      }
    }

    return false;
  }

  /**
   * @public
   * @async
   * Uploads given slice to the server
   * @param {ArrayBuffer | Blob | File} fileSlice - The file slice
   * @param {Range} range - The range value
   * @param {number} totalSize - The total size of a complete file
   */
  public async uploadSlice(
    fileSlice: ArrayBuffer | Blob | File,
    range: Range,
    totalSize: number,
  ): Promise<any> {
    try {
      const headers = {
        'Content-Length': `${range.maxValue - range.minValue + 1}`,
        'Content-Range': `bytes ${range.minValue}-${range.maxValue}/${totalSize}`,
      };

      return await this.client
        .api(this.uploadSession.url)
        .headers(headers)
        .put(fileSlice);
    } catch (err) {
      throw err;
    }
  }

  /**
   * @public
   * @async
   * Deletes upload session in the server
   * @returns The promise resolves to cancelled response
   */
  public async cancel(): Promise<any> {
    try {
      return await this.client.api(this.uploadSession.url).delete();
    } catch (err) {
      throw err;
    }
  }

  /**
   * @public
   * @async
   * Gets status for the upload session
   * @returns The promise resolves to the status enquiry response
   */
  public async getStatus(update = true): Promise<UploadStatusResponse> {
    try {
      const response = await this.client.api(this.uploadSession.url).get();
      if (update) {
        this.updateTaskStatus(response);
      }
      return response;
    } catch (err) {
      throw err;
    }
  }

  /**
   * @public
   * @async
   * Resumes upload session and continue uploading the file from the last sent range
   * @returns The promise resolves to the uploaded response
   */
  public async resume(): Promise<any> {
    try {
      await this.getStatus();
      return await this.upload();
    } catch (err) {
      throw err;
    }
  }
}

class Range {
  /**
   * @public
   * The minimum value of the range
   */
  public minValue: number;

  /**
   * @public
   * The maximum value of the range
   */
  public maxValue: number;

  /**
   * @public
   * @constructor
   * Creates a range for given min and max values
   * @param {number} [minVal = -1] - The minimum value.
   * @param {number} [maxVal = -1] - The maximum value.
   * @returns An instance of a Range
   */
  public constructor(minVal = -1, maxVal = -1) {
    this.minValue = minVal;
    this.maxValue = maxVal;
  }
}
