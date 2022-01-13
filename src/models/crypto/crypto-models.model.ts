import {Cipher} from 'crypto';

import {ContentStreamer} from '../content/content-streamer.model';

export type SupportedEncryptionAlgorithm = 'aes-256-gcm' | 'aes-256-ctr';

export const supportedEncryptionAlgorithms: SupportedEncryptionAlgorithm[] = [
  'aes-256-gcm',
  'aes-256-ctr',
];

export const supportedEncryptionPolicies: {
  [key: string]: SupportedEncryptionPolicy;
} = {
  'aes-256-gcm': {
    algorithm: 'aes-256-gcm',
    authenticated: true,
    supportsRandomAccess: false,
    blockSize: 16,
  },
  'aes-256-ctr': {
    algorithm: 'aes-256-ctr',
    authenticated: false,
    supportsRandomAccess: true,
    blockSize: 16,
  },
};

export const DEFAULT_ENCRYPTION_ALGORITHM: SupportedEncryptionAlgorithm =
  'aes-256-ctr';

export interface SupportedEncryptionPolicy {
  algorithm: SupportedEncryptionAlgorithm;
  authenticated: boolean;
  supportsRandomAccess: boolean;
  blockSize: number;
}

export interface IEncryptionSpecifications {
  alg: SupportedEncryptionAlgorithm;
  key?: string;
  iv?: string;
}

export interface IDecryptionSpecifications {
  alg: SupportedEncryptionAlgorithm;
  key?: string;
  iv?: string;
  auth?: string;
  ivOffset?: number;
}

export interface EncryptedContentLocatorWrapper {
  content: ContentStreamer;
  encryption?: IDecryptionSpecifications;
  cipher?: Cipher;
}
