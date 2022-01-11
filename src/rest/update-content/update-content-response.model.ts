import {model} from '@loopback/repository';
import {ContentDto} from '../dto/content-dto.model';

@model({
  name: 'UpdateContentResponse',
})
export class UpdateContentResponse extends ContentDto {
  constructor(data?: Partial<UpdateContentResponse>) {
    super(data);
  }
}
