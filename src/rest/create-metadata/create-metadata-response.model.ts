import {model} from '@loopback/repository';
import {MetadataDto} from '../dto/metadata-dto.model';

@model()
export class CreateMetadataResponse extends MetadataDto {
  constructor(data?: Partial<CreateMetadataResponse>) {
    super(data);
  }
}
