import {BindingScope, inject, injectable} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {repository} from '@loopback/repository';
import {HttpErrors, Request, RestBindings} from '@loopback/rest';
import {SecurityBindings} from '@loopback/security';
import {LoggerBindings} from '../key';
import {
  AbstractContent,
  ClientTenant,
  StorageNode,
  StorageNodeMetadata,
  StorageNodeShare,
  UploadSession,
} from '../models';
import {
  AclClientTenantRecordRepository,
  ClientTenantRepository,
  StorageNodeRepository,
} from '../repositories';
import {AclStorageNodeRecordRepository} from '../repositories/acl-storage-node-record.repository';
import {Security} from '../security';
import {ClientProfile} from './client-profile.service';

export type AuthCheckDelegate<T> = (entity: T) => Promise<void>;

@injectable({scope: BindingScope.REQUEST})
export class AclService {
  logPrefix = '[ACL] ';
  resolutionCache: {[key: string]: Security.Permissions[]} = {};

  constructor(
    @inject(LoggerBindings.SECURITY_LOGGER) private logger: WinstonLogger,
    @inject(RestBindings.Http.REQUEST, {optional: true}) private req: Request,
    @inject(SecurityBindings.USER, {optional: true})
    private client: ClientProfile,
    @repository(ClientTenantRepository)
    private clientTenantRepository: ClientTenantRepository,
    @repository(StorageNodeRepository)
    private storageNodeRepository: StorageNodeRepository,
    @repository(AclClientTenantRecordRepository)
    private aclClientTenantRecordRepository: AclClientTenantRecordRepository,
    @repository(AclStorageNodeRecordRepository)
    private aclStorageNodeRecordRepository: AclStorageNodeRecordRepository,
  ) {}

  public async requirePermissionOnContent(
    tenant: ClientTenant,
    item: StorageNode,
    content: AbstractContent,
    action: Security.Permissions,
  ): Promise<void> {
    this.require(
      action,
      await this.getPermissionsOnContent(tenant, item, content),
    );
  }

  public async requirePermissionOnMetadata(
    tenant: ClientTenant,
    item: StorageNode,
    metadata: StorageNodeMetadata,
    action: Security.Permissions,
  ): Promise<void> {
    this.require(
      action,
      await this.getPermissionsOnNodeMetadata(tenant, item, metadata),
    );
  }

  public async requirePermissionOnNodeShare(
    tenant: ClientTenant,
    item: StorageNode,
    share: StorageNodeShare,
    action: Security.Permissions,
  ): Promise<void> {
    this.require(
      action,
      await this.getPermissionsOnNodeShare(tenant, item, share),
    );
  }

  public async requirePermissionOnNode(
    tenant: ClientTenant,
    item: StorageNode,
    action: Security.Permissions,
  ): Promise<void> {
    this.require(action, await this.getPermissionsOnNode(tenant, item));
  }

  public async requirePermissionOnNodes(
    tenant: ClientTenant,
    items: StorageNode[],
    action: Security.Permissions,
  ): Promise<void> {
    for (const item of items) {
      this.require(action, await this.getPermissionsOnNode(tenant, item));
    }
  }

  public async requirePermissionOnUploadSession(
    session: UploadSession,
    action: Security.Permissions,
  ): Promise<void> {
    this.require(action, await this.getPermissionsOnUploadSession(session));
  }

  public async requirePermissionOnTenant(
    tenant: ClientTenant | number,
    action: Security.Permissions,
  ): Promise<void> {
    this.require(action, await this.getPermissionsOnTenant(tenant));
  }

  private require(action: Security.Permissions, given: Security.Permissions[]) {
    const p = given.indexOf(action) !== -1;

    if (!p) {
      if (this.client) {
        throw new HttpErrors.Forbidden();
      } else {
        throw new HttpErrors.Unauthorized();
      }
    }
  }

  public async getPermissionsOnContent(
    tenant: ClientTenant,
    node: StorageNode,
    content: AbstractContent,
  ): Promise<Security.Permissions[]> {
    return this.cacheOrCompute(
      this.forNodeContent(tenant, node, content),
      async () => {
        // if user is admin, grant owner permissions
        if (this.isAdmin()) {
          return this.expand(Security.Permissions.OWNER);
        }
        return this.getPermissionsOnNode(tenant, node);
      },
    );
  }

  public async getPermissionsOnNodeMetadata(
    tenant: ClientTenant,
    node: StorageNode,
    metadata: StorageNodeMetadata,
  ): Promise<Security.Permissions[]> {
    return this.cacheOrCompute(
      this.forNodeMetadata(tenant, node, metadata),
      async () => {
        // if user is admin, grant owner permissions
        if (this.isAdmin()) {
          return this.expand(Security.Permissions.OWNER);
        }
        return this.getPermissionsOnNode(tenant, node);
      },
    );
  }

  public async getPermissionsOnNodeShare(
    tenant: ClientTenant,
    node: StorageNode,
    share: StorageNodeShare,
  ): Promise<Security.Permissions[]> {
    return this.cacheOrCompute(
      this.forNodeShare(tenant, node, share),
      async () => {
        // if user is admin, grant owner permissions
        if (this.isAdmin()) {
          return this.expand(Security.Permissions.OWNER);
        }
        const nodePermissions = await this.getPermissionsOnNode(tenant, node);
        // user can operate on share only if he owns the node
        if (nodePermissions.indexOf(Security.Permissions.OWNER) !== -1) {
          return this.expand(Security.Permissions.OWNER);
        } else {
          return [];
        }
      },
    );
  }

  public async getPermissionsOnNode(
    tenant: ClientTenant,
    node: StorageNode,
  ): Promise<Security.Permissions[]> {
    return this.cacheOrCompute(this.forNode(tenant, node), async () => {
      // if user is admin, grant owner permissions
      if (this.isAdmin()) {
        return this.expand(Security.Permissions.OWNER);
      }

      let permissionsByTenant = await this.getPermissionsOnTenant(tenant);
      if (permissionsByTenant.indexOf(Security.Permissions.OWNER) !== -1) {
        // no more permissions needed
        return permissionsByTenant;
      }

      // check for ACL entries at node level
      const aclAtNodeLevel = await this.aclStorageNodeRecordRepository.findOne({
        where: {
          tenantId: tenant.id,
          clientIdentifier: this.client.code,
          nodeId: node.id,
        },
      });
      if (aclAtNodeLevel) {
        this.logger.debug(
          `client ${this.client.code} has node-level ACL entry granting ${aclAtNodeLevel.policy} on node ${node.uuid}`,
        );
        permissionsByTenant = permissionsByTenant.concat(
          this.expand(aclAtNodeLevel.policy),
        );
      }

      // check for inherited
      let currentNode = node;
      while (currentNode.parentId) {
        currentNode = await this.storageNodeRepository.findById(
          currentNode.parentId,
        );
        const aclAtParentLevel =
          await this.aclStorageNodeRecordRepository.findOne({
            where: {
              tenantId: tenant.id,
              clientIdentifier: this.client.code,
              nodeId: currentNode.id,
              recursive: true,
            },
          });
        if (aclAtParentLevel) {
          this.logger.debug(
            `client ${this.client.code} has inherit-parent-node-level ACL entry ` +
              `granting ${aclAtParentLevel.policy} on node ${node.uuid} from parent node ${currentNode.uuid}`,
          );
          permissionsByTenant = permissionsByTenant.concat(
            this.expand(aclAtParentLevel.policy),
          );
        }
      }

      return permissionsByTenant;
    });
  }

  public async getPermissionsOnUploadSession(
    session: UploadSession,
  ): Promise<Security.Permissions[]> {
    return this.cacheOrCompute(this.forUploadSession(session), async () => {
      // if user is admin, grant owner permissions
      if (this.isAdmin()) {
        return this.expand(Security.Permissions.OWNER);
      }

      // authorize only the creator of the session
      if (session.createdBy && session.createdBy === this.client?.code) {
        return this.expand(Security.Permissions.OWNER);
      }

      // no authorizations
      return [];
    });
  }

  public async getPermissionsOnTenant(
    tenant: ClientTenant | number,
  ): Promise<Security.Permissions[]> {
    return this.cacheOrCompute(this.forTenant(tenant), async () => {
      // if user is admin, grant owner permissions
      if (this.isAdmin()) {
        return this.expand(Security.Permissions.OWNER);
      }

      if (!(tenant instanceof ClientTenant)) {
        tenant = await this.clientTenantRepository.findById(tenant);
      }

      // client owns the tenant - no other things to check for
      if (
        tenant.ownerIdentifier &&
        tenant.ownerIdentifier === this.client?.code
      ) {
        return this.expand(Security.Permissions.OWNER);
      }

      // check acl entries at tenant level
      const aclAtTenantLevel =
        await this.aclClientTenantRecordRepository.findOne({
          where: {
            tenantId: tenant.id,
            clientIdentifier: this.client.code,
          },
        });
      if (aclAtTenantLevel) {
        this.logger.debug(
          `client ${this.client.code} has tenant-level ACL entry ` +
            `granting ${aclAtTenantLevel.policy} on tenant ${tenant.id}`,
        );
        return this.expand(aclAtTenantLevel.policy);
      }

      // no authorizations
      return [];
    });
  }

  private async cacheOrCompute(
    token: string,
    compute: () => Promise<Security.Permissions[]>,
  ) {
    if (this.resolutionCache[token]) {
      this.logger.debug(`permissions cache hit for token ${token}`);
      return this.resolutionCache[token];
    }
    this.logger.verbose(`computing permissions for token ${token}`);
    const result = await compute();
    this.resolutionCache[token] = result;
    return result;
  }

  private forTenant(tenant: ClientTenant | number): string {
    const id = tenant instanceof ClientTenant ? tenant.id : tenant;
    return `@tenant(${id})`;
  }

  private forUploadSession(session: UploadSession): string {
    return `@uploadSession(${session.id})`;
  }

  private forNode(
    tenant: ClientTenant | number,
    node: StorageNode | number,
  ): string {
    const id = node instanceof StorageNode ? node.id : node;
    return `${this.forTenant(tenant)}/@node(${id})`;
  }

  private forNodeContent(
    tenant: ClientTenant | number,
    node: StorageNode | number,
    content: AbstractContent | number,
  ): string {
    const id = content instanceof AbstractContent ? content.id : content;
    return `${this.forNode(tenant, node)}/@content(${id})`;
  }

  private forNodeMetadata(
    tenant: ClientTenant | number,
    node: StorageNode | number,
    metadata: StorageNodeMetadata | number,
  ): string {
    const id = metadata instanceof StorageNodeMetadata ? metadata.id : metadata;
    return `${this.forNode(tenant, node)}/@metadata(${id})`;
  }

  private forNodeShare(
    tenant: ClientTenant | number,
    node: StorageNode | number,
    share: StorageNodeShare | number,
  ): string {
    const id = share instanceof StorageNodeShare ? share.id : share;
    return `${this.forNode(tenant, node)}/@share(${id})`;
  }

  private expand(p: Security.Permissions | string): Security.Permissions[] {
    if (!p) {
      return [];
    }
    switch (p) {
      case Security.Permissions.OWNER:
        return [
          Security.Permissions.OWNER,
          Security.Permissions.READ,
          Security.Permissions.WRITE,
        ];
      case Security.Permissions.WRITE:
        return [Security.Permissions.READ, Security.Permissions.WRITE];
    }

    return [p as Security.Permissions];
  }

  private isAdmin(): boolean {
    return (
      (this.client?.scopes ?? []).indexOf(Security.SCOPES.PLATFORM_ADMIN) !== -1
    );
  }
}
