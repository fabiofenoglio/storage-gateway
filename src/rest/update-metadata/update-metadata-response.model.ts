import {model} from '@loopback/repository';
import {MetadataDto} from '../dto/metadata-dto.model';

@model()
export class UpdateMetadataResponse extends MetadataDto {
  constructor(data?: Partial<UpdateMetadataResponse>) {
    super(data);
  }
}
