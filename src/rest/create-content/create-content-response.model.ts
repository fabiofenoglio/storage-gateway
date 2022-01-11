import {model} from '@loopback/repository';
import {ContentDto} from '../dto/content-dto.model';

@model({
  name: 'CreateContentResponse',
})
export class CreateContentResponse extends ContentDto {
  constructor(data?: Partial<CreateContentResponse>) {
    super(data);
  }
}
