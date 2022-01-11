import {model, Model, property} from '@loopback/repository';
import {
  IDecryptionSpecifications,
  SupportedEncryptionAlgorithm,
} from '../crypto/crypto-models.model';

@model()
export class ContentEncryptionMetadata
  extends Model
  implements IDecryptionSpecifications
{
  @property({
    type: 'string',
  })
  alg: SupportedEncryptionAlgorithm;

  @property({
    type: 'string',
  })
  key?: string;

  @property({
    type: 'string',
  })
  iv?: string;

  @property({
    type: 'string',
  })
  auth?: string;

  constructor(data?: Partial<ContentEncryptionMetadata>) {
    super(data);
  }
}
