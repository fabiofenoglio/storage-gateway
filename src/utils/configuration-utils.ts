import fs from 'fs';
import lodash from 'lodash';

/* eslint-disable @typescript-eslint/no-explicit-any */
import {ApplicationConfig} from '@loopback/core';

import {ObjectUtils} from './object-utils';
import {StringUtils} from './string-utils';

export interface AppCustomConfig extends ApplicationConfig {
  datasource: any;
  envName: string;
  allowSchemaMigration: boolean;
  baseUrl: string;
  security: AppCustomSecurityConfig;
  upload: AppCustomUploadConfig;
  memory: AppCustomMemoryConfig;
  onedrive: AppCustomOnedriveConfig;
  filesystem: AppCustomFilesystemConfig;
  s3: AppCustomS3Config;
  logging: AppCustomLoggingConfig;
  errorHandling: AppCustomErrorHandlingConfig;
  cron: AppCustomCronConfig;
  [index: string]: any;
}

export interface AppCustomErrorHandlingConfig {
  enableRollbar: boolean;
  rollbarToken: string;
}

export interface AppCustomLoggingConfig {
  rootLevel: string;
  datasourceLevel: string;
  securityLevel: string;
  serviceLevel: string;
  onedriveLevel: string;
  s3Level: string;
}

export interface AppCustomSecurityConfig {
  realm: string;
  tokenSecret: string;
  tokenIssuer: string;
  exposeErrorDetails: boolean;
  algorithm: 'HS256';
}

export interface AppCustomUploadConfig {
  location: string;
  limits: {
    /** Maximum size of each form field name in bytes. (Default: 100) */
    fieldNameSize?: number;
    /** Maximum size of each form field value in bytes. (Default: 1048576) */
    fieldSize?: number;
    /** Maximum number of non-file form fields. (Default: Infinity) */
    fields?: number;
    /** Maximum size of each file in bytes. (Default: Infinity) */
    fileSize?: number;
    /** Maximum number of file fields. (Default: Infinity) */
    files?: number;
    /** Maximum number of parts (non-file fields + files). (Default: Infinity) */
    parts?: number;
    /** Maximum number of headers. (Default: 2000) */
    headerPairs?: number;
  };
  multipart: AppCustomMultipartUploadConfig;
}

export interface AppCustomMultipartUploadConfig {
  location: string;
  limits: {
    parts: number;
    partSize: number;
    totalSize: number;
  };
}

export interface AppCustomOnedriveConfig {
  enable: boolean;
  applicationClientId: string;
  applicationClientSecret: string;
  applicationRedirectUrl: string;
  applicationRequiredScopes: string[];
  rootFolder: string;
}

export interface AppCustomS3Config {
  enable: boolean;
  s3ForcePathStyle: boolean;
  defaultTresholdForSingleBufferingRequest: number;
  defaultTresholdForSinglePartUpload: number;
  defaultMultipartUploadPartSize: number;
}

export interface AppCustomFilesystemConfig {
  enable: boolean;
  rootFolder: string;
}

export interface AppCustomMemoryConfig {
  enable: boolean;
}

export interface AppCustomCronConfig {
  enable: boolean;
}

export abstract class ConfigurationUtils {
  private static commonConfiguration: AppCustomConfig =
    ConfigurationUtils.readConfigurationFromFile('config-common.json')!;

  private static builtConfiguration: AppCustomConfig;

  static buildConfiguration(
    envName: string | undefined = undefined,
  ): AppCustomConfig {
    if (!envName) {
      envName = ConfigurationUtils.getEnv();
    }

    if (!envName) {
      throw new Error(
        `Missing profile. Have you configured the ${
          'NODE_ENV_' + this.commonConfiguration.appCode
        } environment variable?`,
      );
    }

    const configFile = `config-${envName.toLowerCase()}.json`;
    const profiledConfiguration = ConfigurationUtils.readConfigurationFromFile(
      configFile,
      { optional: true },
    );

    if (!profiledConfiguration) {
      throw new Error(
        `Missing profile configuration. Is the profile "${
          envName.toLowerCase()
        }" correct? Is the configuration file "${configFile}" present?`,
      );
    }

    const merged = lodash.merge(
      lodash.merge({}, this.commonConfiguration),
      profiledConfiguration,
    ) as AppCustomConfig;

    // replace placeholders
    let stringified = JSON.stringify(merged);

    stringified = StringUtils.format(stringified, null, k =>
      this.resolveProperty(k),
    );

    return JSON.parse(stringified);
  }

  static resolveProperty(key: string): string | null {
    let resolved: string | null | undefined = null;
    if (key.toLowerCase().startsWith('env.')) {
      const envKey = key.substr(4);
      resolved = process.env[envKey];
    }

    if (resolved === null || resolved === undefined) {
      return null;
    }

    if (ObjectUtils.isDefined(resolved)) {
      let strfd = JSON.stringify(resolved);
      if (strfd.startsWith('"')) {
        strfd = strfd.substr(1, strfd.length - 2);
      }
      resolved = strfd;
    }

    return resolved;
  }

  static getConfig(): AppCustomConfig {
    if (!ConfigurationUtils.builtConfiguration) {
      ConfigurationUtils.builtConfiguration =
        ConfigurationUtils.buildConfiguration();
    }
    return ConfigurationUtils.builtConfiguration;
  }

  static getEnv(): string {
    const key = 'NODE_ENV';
    return (
      process.env[
        key + '_' + ObjectUtils.require(this.commonConfiguration, 'appCode')
      ] ??
      process.env[key] ??
      'local'
    );
  }

  static fromEnv(key: string): string | undefined {
    return process.env[key] ?? undefined;
  }

  static readConfigurationFromFile(
    name: string,
    options?: {optional: boolean},
  ): any {
    const fullpath = './src/config/' + name;
    if (!fs.existsSync(fullpath)) {
      if (options?.optional) {
        return null;
      }
      throw new Error('File not found: ' + fullpath);
    }
    return JSON.parse(fs.readFileSync(fullpath).toString());
  }
}
