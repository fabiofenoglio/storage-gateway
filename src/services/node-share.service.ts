import {inject, injectable, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {juggler, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {SecurityBindings} from '@loopback/security';
import {ClientProfile} from '.';
import {ConfigurationBindings, LoggerBindings} from '../key';
import {
  ClientTenant,
  Page,
  Pageable,
  StorageNode,
  StorageNodeShare,
} from '../models';
import {StorageNodeShareRepository} from '../repositories';
import {NodeShareDto} from '../rest';
import {
  CreateNodeShareRequest,
  CreateNodeShareResponse,
} from '../rest/create-node-share';
import {GetNodeShareResponse} from '../rest/get-node-share';
import {
  ListNodeSharesRequest,
  ListNodeSharesResponse,
} from '../rest/list-node-shares';
import {AppCustomConfig} from '../utils';
import {FilterUtils} from '../utils/filter-utils';
import {PaginationUtils} from '../utils/pagination-utils';
import {SanitizationUtils} from '../utils/sanitization-utils';
import {MapperService} from './mapper.service';
import {TransactionService} from './transaction-manager.service';

@injectable()
export class NodeShareService {
  engineVersion = 1;

  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER) private logger: WinstonLogger,
    @inject(SecurityBindings.USER, {optional: true})
    private client: ClientProfile,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private configuration: AppCustomConfig,
    @repository(StorageNodeShareRepository)
    private storageNodeShareRepository: StorageNodeShareRepository,
    @service(MapperService) private mapperService: MapperService,
    @service(TransactionService) private transactionService: TransactionService,
  ) {}

  public async listShare(
    tenant: ClientTenant,
    node: StorageNode,
    pageable: Pageable,
    filter?: ListNodeSharesRequest,
  ): Promise<{
    entities: StorageNodeShare[];
    dto: ListNodeSharesResponse;
  }> {
    if (!tenant || !node?.id) {
      throw new HttpErrors.BadRequest();
    }

    const share = await this.fetchShare(
      node,
      undefined,
      undefined,
      pageable,
      filter,
    );

    const mappedContent: NodeShareDto[] = [];
    for (const entity of share.content) {
      mappedContent.push(await this.toNodeShareDto(entity));
    }

    return {
      entities: share.content,
      dto: new ListNodeSharesResponse({
        ...share,
        content: mappedContent,
      }),
    };
  }

  public async getShare(
    tenant: ClientTenant,
    node: StorageNode,
    shareKey: string,
  ): Promise<{
    entity: StorageNodeShare;
    dto: GetNodeShareResponse;
  }> {
    if (!tenant || !node?.id || !shareKey) {
      throw new HttpErrors.BadRequest();
    }
    shareKey = SanitizationUtils.sanitizeUUID(shareKey);

    const share = await this.findOrNotFound(node, shareKey);

    return {
      entity: share,
      dto: new GetNodeShareResponse({
        ...(await this.toNodeShareDto(share)),
      }),
    };
  }

  public async createShare(
    tenant: ClientTenant,
    node: StorageNode,
    request: CreateNodeShareRequest,
  ): Promise<CreateNodeShareResponse> {
    if (!tenant || !node?.id || !request) {
      throw new HttpErrors.BadRequest();
    }

    const saved = await this.transactionService.inTransaction(
      async transaction => {
        // insert new share
        return this.insert(node, request, transaction);
      },
    );

    // map to dto and return
    return new CreateNodeShareResponse({
      ...(await this.toNodeShareDto(saved)),
    });
  }

  public async deleteShare(
    tenant: ClientTenant,
    node: StorageNode,
    shareKey: string,
  ): Promise<void> {
    if (!tenant || !node?.id || !shareKey) {
      throw new HttpErrors.BadRequest();
    }

    shareKey = SanitizationUtils.sanitizeUUID(shareKey);

    // retrieve node
    const share = await this.findOrNotFound(node, shareKey);

    await this.transactionService.inTransaction(async transaction => {
      // do delete
      await this.delete(share, transaction);
    });
  }

  private async insert(
    node: StorageNode,
    request: CreateNodeShareRequest,
    transaction: juggler.Transaction,
  ): Promise<StorageNodeShare> {
    const entity = this.storageNodeShareRepository.new({
      type: SanitizationUtils.sanitizeShareType(
        this.getOrBadRequest(request, 'type'),
      ),
      nodeId: this.getOrBadRequest(node, 'id'),
      createdBy: this.client.code,
    });

    // TODO: delegate direct link creation to content manager

    const saved = await this.storageNodeShareRepository.create(entity, {
      transaction,
    });
    return saved;
  }

  private async delete(
    share: StorageNodeShare,
    transaction: juggler.Transaction,
  ): Promise<void> {
    await this.storageNodeShareRepository.delete(share, {transaction});
  }

  public async batchDelete(
    tenant: ClientTenant,
    nodes: StorageNode[],
    transaction: juggler.Transaction,
  ): Promise<void> {
    this.requireExistingTransaction(transaction);
    if (!tenant?.id) {
      throw new HttpErrors.BadRequest();
    }
    if (!nodes?.length) {
      return;
    }

    // delegate content deletion to specific backbone manager
    this.logger.debug(
      'attempting batch share delete for ' + nodes.length + ' nodes',
    );

    const deleteResult = await this.storageNodeShareRepository.deleteAll(
      {
        nodeId: {
          inq: nodes.map(o => o.id!),
        },
      },
      {transaction},
    );

    this.logger.verbose('deleted ' + deleteResult.count + ' share records');
    this.logger.verbose(
      'finished batch share delete for ' + nodes.length + ' nodes',
    );
  }

  private getOrBadRequest<T, K extends keyof T>(
    obj: T,
    key: K,
  ): NonNullable<T[K]> {
    const v = obj[key]; // Inferred type is T[K]
    if (typeof v === 'undefined' || v === null) {
      throw new HttpErrors.BadRequest('Field ' + key + ' is required');
    }
    return v!;
  }

  public async fetchShare(
    node: StorageNode,
    key: string | undefined = undefined,
    transaction: juggler.Transaction | undefined = undefined,
    pageable: Pageable | undefined = undefined,
    filter?: ListNodeSharesRequest,
  ): Promise<Page<StorageNodeShare>> {
    if (!node?.id) {
      throw new Error('Node.Id is required');
    }
    if (key) {
      key = SanitizationUtils.sanitizeUUID(key);
    }

    return this.storageNodeShareRepository.findPage(
      {
        where: {
          nodeId: node.id,
          uuid: key,
          and: [
            {
              type: FilterUtils.enumFilter(filter?.type),
            },
          ],
        },
        order: ['uuid ASC'],
      },
      pageable ?? PaginationUtils.unpaged(),
      {transaction},
    );
  }

  public async fetchShareByAccessToken(
    accessToken: string,
    transaction: juggler.Transaction | undefined = undefined,
  ): Promise<StorageNodeShare | null> {
    accessToken = SanitizationUtils.sanitizeAccessToken(accessToken);
    if (!accessToken) {
      throw new Error('AccessToken is required');
    }

    const share = this.storageNodeShareRepository.findOne(
      {
        where: {
          accessToken,
        },
      },
      {transaction},
    );

    return share;
  }

  private async findOrNotFound(
    node: StorageNode,
    shareKey: string,
  ): Promise<StorageNodeShare & Required<Pick<StorageNodeShare, 'id'>>> {
    if (!node || !shareKey) {
      throw new HttpErrors.BadRequest();
    }
    shareKey = SanitizationUtils.sanitizeUUID(shareKey);

    const entity = await this.storageNodeShareRepository.findOne({
      where: {
        nodeId: node.id,
        uuid: shareKey,
      },
    });

    if (!entity || !entity?.id) {
      throw new HttpErrors.NotFound();
    }

    return entity as StorageNodeShare & Required<Pick<StorageNodeShare, 'id'>>;
  }

  private requireExistingTransaction(
    transaction: juggler.Transaction | undefined,
  ) {
    if (!transaction) {
      throw new Error(
        'An active transactional context is required but no transaction was given.',
      );
    }
  }

  private async toNodeShareDto(share: StorageNodeShare): Promise<NodeShareDto> {
    return new NodeShareDto({
      ...this.mapperService.toNodeShareDto(
        share,
        await this.getEmbedUrl(share),
      ),
    });
  }

  private async getEmbedUrl(share: StorageNodeShare): Promise<string> {
    const gen = await this.generateDefaultEmbedUrl(share);
    const url = gen.relative ? this.configuration.baseUrl + gen.url : gen.url;
    return url;
  }

  private async generateDefaultEmbedUrl(share: StorageNodeShare): Promise<{
    url: string;
    relative: boolean;
  }> {
    const url = `/shares/${share.accessToken}`;

    return {
      url,
      relative: true,
    };
  }
}
