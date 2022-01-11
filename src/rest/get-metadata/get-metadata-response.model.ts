import {model} from '@loopback/repository';
import {MetadataDto} from '../dto/metadata-dto.model';

@model()
export class GetMetadataResponse extends MetadataDto {
  constructor(data?: Partial<GetMetadataResponse>) {
    super(data);
  }
}
