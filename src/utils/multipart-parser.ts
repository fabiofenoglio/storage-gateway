/* eslint-disable @typescript-eslint/no-explicit-any */
import {inject} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {BodyParser, Request, RequestBody} from '@loopback/rest';
import fs from 'fs';
import multer from 'multer';
import {v4 as uuidv4} from 'uuid';
import {ConfigurationBindings, LoggerBindings} from '../key';
import {RawUploadDto} from '../models/content/content-upload-dto.model';
import {AppCustomConfig} from './configuration-utils';

export const FORM_DATA = 'multipart/form-data';

export class MultipartFormDataBodyParser implements BodyParser {
  name = FORM_DATA;

  constructor(
    @inject(LoggerBindings.ROOT_LOGGER) private logger: WinstonLogger,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
  ) {}

  supports(mediaType: string) {
    return mediaType.startsWith(FORM_DATA);
  }

  async parse(request: Request): Promise<RequestBody> {
    // const storage = multer.memoryStorage();
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const now = new Date();
        const subFolder = now.toISOString().slice(0, 10) + '/';
        const fullFolder = this.configuration.upload.location + '/' + subFolder;

        if (!fs.existsSync(fullFolder)) {
          this.logger.info('creating upload directory ' + fullFolder);
          fs.mkdirSync(fullFolder, {
            recursive: true,
            mode: 0o755,
          });
        }

        cb(null, fullFolder);
      },
      filename: (req, file, cb) => {
        const now = new Date();
        cb(null, 'upload-' + now.getTime() + '-' + uuidv4());
      },
    });

    const upload = multer({
      storage,
      limits: {
        ...this.configuration.upload.limits,
      },
    });

    return new Promise<RequestBody>((resolve, reject) => {
      upload.any()(request, {} as any, (err: unknown) => {
        if (err) {
          reject(err);
        } else {
          const parsed: RawUploadDto = {
            files: request.files as any,
            fields: request.body,
          };
          if (request.body?.data) {
            const parsedData = JSON.parse(request.body.data);
            Object.assign(parsed.fields, parsedData);
            delete parsed.fields['data'];
            parsed.parsedData = parsedData;
          }
          resolve({
            value: parsed,
          });
        }
      });
    });
  }
}
