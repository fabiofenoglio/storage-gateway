import {inject, injectable, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {HttpErrors} from '@loopback/rest';

import {LoggerBindings} from '../key';
import {
  AbstractContent,
  ClientTenant,
  StorageNode,
  StorageNodeMetadata,
  StorageNodeShare,
  UploadSession,
} from '../models';
import {ContentAssetMetadata} from '../models/content/content-asset-metadata.model';
import {Security} from '../security';
import {Constants, ObjectUtils} from '../utils';
import {SanitizationUtils} from '../utils/sanitization-utils';
import {AclService} from './acl.service';
import {ClientTenantService} from './client-tenant.service';
import {ContentService} from './content/content.service';
import {MultipartUploadService} from './multipart-upload.service';
import {NodeMetadataService} from './node-metadata.service';
import {NodeShareService} from './node-share.service';
import {StorageNodeService} from './storage-node.service';

@injectable()
export class EntityResolverService {
  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER) private logger: WinstonLogger,
    @service(StorageNodeService) private storageNodeService: StorageNodeService,
    @service(NodeMetadataService) private metadataService: NodeMetadataService,
    @service(ContentService) private contentService: ContentService,
    @service(NodeShareService) private nodeShareService: NodeShareService,
    @service(AclService) private aclService: AclService,
    @service(ClientTenantService)
    private clientTenantService: ClientTenantService,
    @service(MultipartUploadService)
    private multipartUploadService: MultipartUploadService,
  ) {}

  public async resolveTenant(
    tenantUUID: string,
    auth?: Security.Permissions,
  ): Promise<ClientTenant> {
    this.logger.debug('resolving tenant from code ' + tenantUUID);

    if (!tenantUUID) {
      throw new HttpErrors.BadRequest('Tenant UUID is required');
    }
    const tenantLookup = await this.clientTenantService.fetch(tenantUUID);
    if (!tenantLookup) {
      throw new HttpErrors.NotFound();
    }

    if (auth) {
      await this.aclService.requirePermissionOnTenant(tenantLookup, auth);
    }

    return tenantLookup;
  }

  public async resolveNode(
    tenantUUID: string,
    uuid: string | null,
    subpath: string | undefined,
    auth?: Security.Permissions,
  ): Promise<{
    tenant: ClientTenant;
    node: StorageNode;
  }> {
    if (ObjectUtils.isDefined(subpath)) {
      subpath = SanitizationUtils.sanitizePath(subpath!);
    }
    const res = await this.resolveNodeOrRoot(tenantUUID, uuid, subpath, auth);
    if (!res.node) {
      throw new HttpErrors.BadRequest('Operation not allowed on root');
    }
    return {
      tenant: res.tenant,
      node: res.node,
    };
  }

  public async resolveNodeOrRoot(
    tenantUUID: string,
    uuid: string | null,
    subpath: string | undefined,
    auth?: Security.Permissions,
  ): Promise<{
    tenant: ClientTenant;
    root: boolean;
    node?: StorageNode;
  }> {
    const tenant = await this.resolveTenant(tenantUUID);
    let node: StorageNode | null = null;

    if (!ObjectUtils.isDefined(uuid)) {
      // start resolving from root
      if (ObjectUtils.isDefined(subpath)) {
        subpath = SanitizationUtils.sanitizePath(subpath!);
        const resolution = await this.storageNodeService.resolvePath(
          tenant.id!,
          subpath,
        );
        if (!resolution.found) {
          throw new HttpErrors.NotFound(
            `Could not resolve path ${subpath} in tenant ${tenant.code}`,
          );
        } else if (resolution.node) {
          node = resolution.node;
        }
      }
    } else {
      // start resolving from node with specified UUID
      uuid = SanitizationUtils.sanitizeUUID(uuid!);
      if (!uuid) {
        throw new HttpErrors.BadRequest();
      }

      node = await this.storageNodeService.fetch(tenant, uuid);
      if (!node) {
        throw new HttpErrors.NotFound(
          `Node ${uuid} was not found in tenant ${tenant.code}`,
        );
      }

      if (ObjectUtils.isDefined(subpath)) {
        subpath = SanitizationUtils.sanitizePath(subpath!);
        const resolution = await this.storageNodeService.resolvePath(
          tenant.id!,
          subpath,
          node,
        );
        if (!resolution.found) {
          throw new HttpErrors.NotFound(
            `Could not resolve path ${uuid}:${subpath} in tenant ${tenant.code}`,
          );
        } else if (resolution.node) {
          node = resolution.node;
        }
      }
    }

    // check required permissions
    if (auth) {
      if (node) {
        await this.aclService.requirePermissionOnNode(tenant, node, auth);
      } else {
        await this.aclService.requirePermissionOnTenant(tenant, auth);
      }
    }

    return {
      tenant,
      node: node ?? undefined,
      root: !node,
    };
  }

  public async resolveMetadata(
    tenantUUID: string,
    nodeUUID: string,
    nodeSubPath: string | undefined,
    metadataKey: string,
    auth?: Security.Permissions,
  ): Promise<{
    tenant: ClientTenant;
    node: StorageNode;
    metadata: StorageNodeMetadata;
  }> {
    if (ObjectUtils.isDefined(nodeSubPath)) {
      nodeSubPath = SanitizationUtils.sanitizePath(nodeSubPath!);
    }
    const parentResolution = await this.resolveNode(
      tenantUUID,
      nodeUUID,
      nodeSubPath,
    );
    if (!parentResolution.node) {
      throw new HttpErrors.BadRequest('Cannot operate on root metadata');
    }

    // require uuid in input
    metadataKey = SanitizationUtils.sanitizeMetadataKey(metadataKey);
    if (!metadataKey) {
      throw new HttpErrors.BadRequest();
    }

    const metadataPage = await this.metadataService.fetchMetadata(
      parentResolution.node,
      metadataKey,
    );
    if (!metadataPage.hasContent) {
      throw new HttpErrors.NotFound(
        `Metadata ${metadataKey} was not found in node ${parentResolution.node.uuid}`,
      );
    }
    const metadata = metadataPage.content[0];

    if (auth) {
      await this.aclService.requirePermissionOnMetadata(
        parentResolution.tenant,
        parentResolution.node,
        metadata,
        auth,
      );
    }

    return {
      ...parentResolution,
      node: parentResolution.node,
      metadata,
    };
  }

  public async resolveNodeShare(
    tenantUUID: string,
    nodeUUID: string,
    nodeSubPath: string | undefined,
    shareUUID: string,
    auth?: Security.Permissions,
  ): Promise<{
    tenant: ClientTenant;
    node: StorageNode;
    share: StorageNodeShare;
  }> {
    if (ObjectUtils.isDefined(nodeSubPath)) {
      nodeSubPath = SanitizationUtils.sanitizePath(nodeSubPath!);
    }
    const parentResolution = await this.resolveNode(
      tenantUUID,
      nodeUUID,
      nodeSubPath,
    );
    if (!parentResolution.node) {
      throw new HttpErrors.BadRequest('Cannot operate on root metadata');
    }

    // require uuid in input
    shareUUID = SanitizationUtils.sanitizeUUID(shareUUID);
    if (!shareUUID) {
      throw new HttpErrors.BadRequest();
    }

    const sharePage = await this.nodeShareService.fetchShare(
      parentResolution.node,
      shareUUID,
    );
    if (!sharePage.hasContent) {
      throw new HttpErrors.NotFound(
        `Share ${sharePage} was not found in node ${parentResolution.node.uuid}`,
      );
    }
    const share = sharePage.content[0];

    if (auth) {
      await this.aclService.requirePermissionOnNodeShare(
        parentResolution.tenant,
        parentResolution.node,
        share,
        auth,
      );
    }

    return {
      ...parentResolution,
      node: parentResolution.node,
      share,
    };
  }

  public async resolveDirectShare(
    accessToken: string,
    assetKey?: string,
  ): Promise<{
    tenant: ClientTenant;
    node: StorageNode;
    share: StorageNodeShare;
    content: AbstractContent;
    asset?: ContentAssetMetadata;
  }> {
    // require accessToken in input
    accessToken = SanitizationUtils.sanitizeAccessToken(accessToken);
    if (!accessToken) {
      throw new HttpErrors.BadRequest();
    }

    const share = await this.nodeShareService.fetchShareByAccessToken(
      accessToken,
    );
    if (!share) {
      throw new HttpErrors.NotFound(`Share ${accessToken} was not found`);
    }

    const node = await this.storageNodeService.fetchById(share.nodeId);
    if (!node) {
      throw new HttpErrors.NotFound(
        `Share ${accessToken} was not found on any active nodes`,
      );
    }

    const tenant = await this.clientTenantService.fetchById(node.tenantId);
    if (!tenant) {
      throw new HttpErrors.NotFound(
        `Share ${accessToken} was not found on any active tenant`,
      );
    }

    const content = await this.contentService.fetch(
      tenant,
      node,
      Constants.CONTENT.DEFAULT_KEY,
    );

    let asset: ContentAssetMetadata | undefined = undefined;
    if (ObjectUtils.isDefined(assetKey)) {
      assetKey = SanitizationUtils.sanitizeContentAssetKey(assetKey!);
      asset = (content.metadata?.assets ?? []).find(c => c.key === assetKey);
      if (!asset) {
        throw new HttpErrors.NotFound(
          `Content asset ${assetKey} was not found in node ${node.uuid}`,
        );
      }
    }

    return {
      tenant,
      node,
      share,
      content,
      asset,
    };
  }

  public async resolveContent(
    tenantUUID: string,
    nodeUUID: string,
    nodeSubPath: string | undefined,
    contentKey: string | undefined,
    auth?: Security.Permissions,
  ): Promise<{
    tenant: ClientTenant;
    node: StorageNode;
    content: AbstractContent;
  }> {
    if (ObjectUtils.isDefined(nodeSubPath)) {
      nodeSubPath = SanitizationUtils.sanitizePath(nodeSubPath!);
    }

    const parentResolution = await this.resolveNode(
      tenantUUID,
      nodeUUID,
      nodeSubPath,
    );
    if (!parentResolution.node) {
      throw new HttpErrors.BadRequest('Cannot operate on root metadata');
    }

    // require uuid in input
    if (contentKey) {
      contentKey = SanitizationUtils.sanitizeContentKey(contentKey);
    } else {
      contentKey = Constants.CONTENT.DEFAULT_KEY;
    }

    if (!contentKey) {
      throw new HttpErrors.BadRequest();
    }

    const content = await this.contentService.fetch(
      parentResolution.tenant,
      parentResolution.node,
      contentKey,
    );

    if (!content) {
      throw new HttpErrors.NotFound(
        `Content ${contentKey} was not found in node ${parentResolution.node.uuid}`,
      );
    }

    if (auth) {
      await this.aclService.requirePermissionOnContent(
        parentResolution.tenant,
        parentResolution.node,
        content,
        auth,
      );
    }

    return {
      ...parentResolution,
      node: parentResolution.node,
      content,
    };
  }

  public async resolveContentAsset(
    tenantUUID: string,
    nodeUUID: string,
    nodeSubPath: string | undefined,
    contentKey: string | undefined,
    assetKey: string,
    auth?: Security.Permissions,
  ): Promise<{
    tenant: ClientTenant;
    node: StorageNode;
    content: AbstractContent;
    asset: ContentAssetMetadata;
  }> {
    if (ObjectUtils.isDefined(assetKey)) {
      assetKey = SanitizationUtils.sanitizeContentAssetKey(assetKey);
    }

    const parentResolution = await this.resolveContent(
      tenantUUID,
      nodeUUID,
      nodeSubPath,
      contentKey,
      auth,
    );
    if (!parentResolution.node) {
      throw new HttpErrors.BadRequest('Cannot operate on root metadata');
    }

    if (!assetKey) {
      throw new HttpErrors.BadRequest();
    }

    const asset = (parentResolution.content.metadata?.assets ?? []).find(
      c => c.key === assetKey,
    );
    if (!asset) {
      throw new HttpErrors.NotFound(
        `Content asset ${contentKey}/${assetKey} was not found in node ${parentResolution.node.uuid}`,
      );
    }

    return {
      ...parentResolution,
      asset,
    };
  }

  public async resolveClosestNodeToPath(
    tenantUUID: string,
    uuid: string | null,
    subpath: string | undefined,
    auth?: Security.Permissions,
  ): Promise<{
    tenant: ClientTenant;
    root: boolean;
    remainingPath: string | null;
    node?: StorageNode;
  }> {
    const tenant = await this.resolveTenant(tenantUUID);
    let node: StorageNode | null = null;
    let remainingPath: string | null = null;

    if (!ObjectUtils.isDefined(uuid)) {
      // start resolving from root
      if (ObjectUtils.isDefined(subpath)) {
        subpath = SanitizationUtils.sanitizePath(subpath!);
        const resolution = await this.storageNodeService.resolveClosestNode(
          tenant.id!,
          subpath,
        );
        if (resolution.node) {
          node = resolution.node;
        }
        remainingPath = resolution.remainingPath;
      }
    } else {
      // start resolving from node with specified UUID
      uuid = SanitizationUtils.sanitizeUUID(uuid!);
      if (!uuid) {
        throw new HttpErrors.BadRequest();
      }

      node = await this.storageNodeService.fetch(tenant, uuid);
      if (!node) {
        throw new HttpErrors.NotFound(
          `Node ${uuid} was not found in tenant ${tenant.code}`,
        );
      }

      if (ObjectUtils.isDefined(subpath)) {
        subpath = SanitizationUtils.sanitizePath(subpath!);
        const resolution = await this.storageNodeService.resolveClosestNode(
          tenant.id!,
          subpath,
          node,
        );
        if (resolution.node) {
          node = resolution.node;
        }
        remainingPath = resolution.remainingPath;
      }
    }

    // check required permissions
    if (auth) {
      if (node) {
        await this.aclService.requirePermissionOnNode(tenant, node, auth);
      } else {
        await this.aclService.requirePermissionOnTenant(tenant, auth);
      }
    }

    return {
      tenant,
      node: node ?? undefined,
      root: !node,
      remainingPath,
    };
  }

  public async resolveUploadSession(
    sessionUUID: string,
    auth?: Security.Permissions,
  ): Promise<{
    session: UploadSession;
  }> {
    if (ObjectUtils.isDefined(sessionUUID)) {
      sessionUUID = SanitizationUtils.sanitizeUUID(sessionUUID);
    }

    const session = await this.multipartUploadService.fetchByUUID(sessionUUID);
    if (auth) {
      await this.aclService.requirePermissionOnUploadSession(session, auth);
    }

    return {
      session,
    };
  }
}
