import {repository} from '@loopback/repository';
import {ClientTenantRepository, StorageNodeRepository} from '../repositories';

export class DaoService {
  constructor(
    @repository(ClientTenantRepository)
    public clientTenantRepository: ClientTenantRepository,
    @repository(StorageNodeRepository)
    public storageNodeRepository: StorageNodeRepository,
  ) {}
}
