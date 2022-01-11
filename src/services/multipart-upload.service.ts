import {inject, service} from '@loopback/core';
import {WinstonLogger} from '@loopback/logging';
import {juggler, repository} from '@loopback/repository';
import {HttpErrors, Request} from '@loopback/rest';
import {SecurityBindings} from '@loopback/security';
import fs from 'fs-extra';
import multistream, {FactoryStream} from 'multistream';
import {Readable} from 'stream';
import {v4 as uuidv4} from 'uuid';
import {ConfigurationBindings, LoggerBindings} from '../key';
import {
  NodeStatus,
  Page,
  Pageable,
  ResourceLock,
  StorageNode,
  StorageNodeType,
  UploadSession,
  UploadSessionPart,
  UploadSessionPartStatus,
  UploadSessionStatus,
} from '../models';
import {ContentStreamer} from '../models/content/content-streamer.model';
import {
  RawUploadDto,
  SupportedHash,
  supportedHashesList,
  UploadedContent,
  UploadedContentHashes,
  UploadedContentPart,
} from '../models/content/content-upload-dto.model';
import {
  UploadSessionPartRepository,
  UploadSessionRepository,
} from '../repositories';
import {
  CreateContentResponse,
  CreateUploadSessionRequest,
  CreateUploadSessionResponse,
} from '../rest';
import {
  AppCustomConfig,
  AppCustomMultipartUploadConfig,
  attempt,
  ObjectUtils,
  SanitizationUtils,
} from '../utils';
import {StreamUtils} from '../utils/stream-utils';
import {ClientProfile, SystemClient} from './client-profile.service';
import {ClientTenantService} from './client-tenant.service';
import {ContentProcessorService} from './content/content-processor.service';
import {ContentService} from './content/content.service';
import {LockService} from './lock.service';
import {StorageNodeService} from './storage-node.service';

export class MultipartUploadService {
  private DEFAULT_SESSION_TTL_MS = 60 * 60 * 1000; // 60 mins

  constructor(
    @inject(LoggerBindings.SERVICE_LOGGER)
    private logger: WinstonLogger,
    @inject(ConfigurationBindings.ROOT_CONFIG)
    private rootConfiguration: AppCustomConfig,
    @inject(SecurityBindings.USER, {optional: true})
    private client: ClientProfile,
    @repository(UploadSessionRepository)
    private uploadSessionRepository: UploadSessionRepository,
    @repository(UploadSessionPartRepository)
    private uploadSessionPartRepository: UploadSessionPartRepository,
    @service(ContentProcessorService)
    private contentProcessorService: ContentProcessorService,
    @service(ContentService)
    private contentService: ContentService,
    @service(StorageNodeService)
    private storageNodeService: StorageNodeService,
    @service(ClientTenantService)
    private clientTenantService: ClientTenantService,
    @service(LockService)
    private lockService: LockService,
  ) {}

  get configuration(): AppCustomMultipartUploadConfig {
    return this.rootConfiguration.upload.multipart;
  }

  public async createUploadSession(
    node: StorageNode,
    request: CreateUploadSessionRequest,
  ): Promise<CreateUploadSessionResponse> {
    this.logger.debug(`creating a new upload session`);
    const now = new Date();

    // allow only on FILE nodes
    if (StorageNodeType.FILE !== node.type) {
      throw new HttpErrors.BadRequest(
        'Content creation is not allowed on ' + node.type + ' nodes',
      );
    }

    // check total size
    if (request.contentSize > this.configuration.limits.totalSize) {
      throw new HttpErrors.BadRequest(
        `The requested size of ` +
          `${request.contentSize} bytes is over the limit of ${this.configuration.limits.totalSize} bytes`,
      );
    }

    const entity = await this.uploadSessionRepository.inTransaction(
      async transaction => {
        const createdEntity = await this.uploadSessionRepository.create(
          new UploadSession({
            createdAt: now,
            createdBy: ObjectUtils.require(this.client ?? SystemClient, 'code'),
            status: UploadSessionStatus.ACTIVE,
            uuid: uuidv4(),
            expiresAt: new Date(now.getTime() + this.DEFAULT_SESSION_TTL_MS),
            contentSize: ObjectUtils.requireOrBadRequest(
              request,
              'contentSize',
            ),
            encoding: request.encoding,
            mimeType: ObjectUtils.requireOrBadRequest(request, 'mimeType'),
            originalName: SanitizationUtils.sanitizeFilename(
              ObjectUtils.requireOrBadRequest(request, 'fileName'),
            ),
            version: request.version,
            nodeId: ObjectUtils.require(node, 'id'),
            nodeUuid: ObjectUtils.require(node, 'uuid'),
            md5: request.hashes?.md5,
            sha1: request.hashes?.sha1,
            sha256: request.hashes?.sha256,
          }),
          {transaction},
        );

        await this.getExistingUploadSessionFolder(createdEntity);

        return createdEntity;
      },
    );

    this.logger.debug(`created upload session ${entity.id}/${entity.uuid}`);
    return new CreateUploadSessionResponse({
      uuid: entity.uuid,
    });
  }

  public buildUploadLocation(
    entity: UploadSession | string,
    part?: UploadSessionPart,
  ): {
    root: string;
    session: string;
    parts: string;
    part?: string;
  } {
    const entityUUID =
      typeof entity === 'string' ? entity : ObjectUtils.require(entity, 'uuid');
    const rootFolder = ObjectUtils.exactlyOne(
      'configuration.upload.multipart.location',
      this.configuration.location,
    );
    const sessionFolder = rootFolder + '/sessions/' + entityUUID;
    const partsFolder = sessionFolder + '/parts';
    const partFolder = part ? partsFolder + '/' + part.uuid : undefined;

    return {
      root: rootFolder,
      session: sessionFolder,
      parts: partsFolder,
      part: partFolder,
    };
  }

  public async fetchByUUID(uuid: string): Promise<UploadSession> {
    const s = await this.getActiveSessionByUUID(uuid);
    if (!s) {
      throw new HttpErrors.NotFound('Session not found');
    }
    return s;
  }

  private async getActiveSessionByUUID(
    uuid: string,
    transaction?: juggler.Transaction,
  ): Promise<UploadSession | null> {
    const now = new Date();
    return this.uploadSessionRepository.findOne(
      {
        where: {
          uuid: uuid,
          status: {
            inq: [UploadSessionStatus.ACTIVE],
          },
          expiresAt: {
            gt: now,
          },
        },
      },
      {transaction},
    );
  }

  private async getExistingUploadSessionFolder(entity: UploadSession): Promise<{
    root: string;
    session: string;
    parts: string;
  }> {
    // create folder on filesystem
    const targetFolder = this.buildUploadLocation(entity);

    if (!fs.existsSync(targetFolder.parts)) {
      this.logger.verbose('creating directory ' + targetFolder.parts);
      await fs.promises.mkdir(targetFolder.parts, {
        recursive: true,
        mode: 0o755,
      });
    }

    if (!fs.existsSync(targetFolder.session)) {
      this.logger.verbose('creating directory ' + targetFolder.session);
      await fs.promises.mkdir(targetFolder.session, {
        recursive: true,
        mode: 0o755,
      });
    }

    if (!fs.existsSync(targetFolder.root)) {
      this.logger.verbose('creating directory ' + targetFolder.root);
      await fs.promises.mkdir(targetFolder.root, {
        recursive: true,
        mode: 0o755,
      });
    }

    return targetFolder;
  }

  public async processUploadedPart(
    req: Request,
    sessionUUID: string,
    upload: RawUploadDto,
  ): Promise<UploadSessionPart> {
    // look for session
    const activeSession = await this.getActiveSessionByUUID(sessionUUID);

    if (!activeSession) {
      throw new HttpErrors.NotFound(
        'Upload session ' + sessionUUID + ' does not exist',
      );
    }

    if (await this.lockService.peek(this.sessionLockToken(activeSession))) {
      throw new HttpErrors.Conflict(
        'The upload session is not accepting conent at the moment',
      );
    }

    return this.processUploadedPartInLock(req, activeSession, upload);
  }

  public async processUploadedPartInLock(
    req: Request,
    activeSession: UploadSession,
    upload: RawUploadDto,
  ): Promise<UploadSessionPart> {
    const now = new Date();
    ObjectUtils.notNull(activeSession);

    // check declared part number
    const partNumber = parseInt(
      ObjectUtils.exactlyOne('partNumber', [
        upload.fields['partNumber'],
        req.params.partNumber,
        req.query.partNumber as string,
      ]),
      10,
    );

    if (!partNumber || partNumber < 0) {
      throw new HttpErrors.BadRequest('A positive partNumber is required');
    }

    // parse raw upload into DTO
    const uploadedPart = this.validateUploadedContentPart(upload);

    // check that session is active
    this.requireStatus(activeSession, UploadSessionStatus.ACTIVE);

    // check part number limit
    const numActivePartsBeforeThis = (
      await this.uploadSessionPartRepository.count({
        sessionId: activeSession.id,
        status: UploadSessionPartStatus.ACTIVE,
      })
    ).count;

    if (numActivePartsBeforeThis >= this.configuration.limits.parts) {
      throw new HttpErrors.BadRequest(
        `Parts number of ${numActivePartsBeforeThis} exceeds limit of ${this.configuration.limits.parts}`,
      );
    }

    const deletedPartContainer: {contained: UploadSessionPart | null} = {
      contained: null,
    };

    // check that folder exists
    const folders = await this.getExistingUploadSessionFolder(activeSession);

    // open transaction
    const createdEntity = await this.uploadSessionRepository.inTransaction(
      async transaction => {
        // check if part with same number exists already
        const existingActivePart =
          await this.uploadSessionPartRepository.findOne(
            {
              where: {
                sessionId: activeSession.id,
                partNumber,
                status: {
                  eq: UploadSessionPartStatus.ACTIVE,
                },
              },
            },
            {transaction},
          );

        // deactivate existing part with same number
        if (existingActivePart) {
          this.logger.warn(
            `replacing present upload part ${activeSession.id}/${partNumber} with new data`,
          );
          existingActivePart.status = UploadSessionPartStatus.DELETED;
          existingActivePart.transitionedAt = new Date();
          await this.uploadSessionPartRepository.update(existingActivePart, {
            transaction,
          });
          deletedPartContainer.contained = existingActivePart;
        }

        // create new part on db
        // not in transaction, on purpose
        const newEntity = await this.uploadSessionPartRepository.create(
          new UploadSessionPart({
            partNumber,
            sessionId: activeSession.id,
            status: UploadSessionPartStatus.DRAFT,
            uploadedAt: now,
            uuid: uuidv4(),
            size: uploadedPart.size,
          }),
        );
        this.logger.debug(
          `created part ${newEntity.id}/${newEntity.uuid} in status ${newEntity.status}`,
        );

        // prepare file write stream
        const partLocation = folders.parts + '/' + newEntity.uuid;
        this.logger.debug(
          'opening content write stream on location ' + partLocation,
        );
        const writeStream = fs.createWriteStream(partLocation);

        // prepare read stream (with hash computing)
        this.logger.debug('opening content part read stream');
        const readStream = await uploadedPart.content.stream();
        let pipedStream = readStream;

        const hashHolder: UploadedContentHashes = {};
        for (const alg of Object.keys(
          uploadedPart.hashes ?? {},
        ) as SupportedHash[]) {
          this.logger.debug(
            'piping content part stream for ' + alg + ' hashing',
          );
          pipedStream = this.contentProcessorService.wrapStreamWithHashing(
            pipedStream,
            alg,
            (hash, a) => {
              this.logger.debug(`computed part content hash ${a} to ${hash}`);
              hashHolder[a] = hash;
            },
          );
        }

        // pipe streams for writing
        const outstr = StreamUtils.pipeWithErrors(pipedStream, writeStream);
        await StreamUtils.writableToPromise(outstr);
        this.logger.debug('finished writing part content');

        // check declared hashes
        this.contentProcessorService.verifyHashes(
          uploadedPart.hashes,
          hashHolder,
        );

        // transition part status from 'DRAFT' to 'ACTIVE'
        newEntity.status = UploadSessionPartStatus.ACTIVE;
        newEntity.transitionedAt = new Date();
        await this.uploadSessionPartRepository.update(newEntity, {transaction});
        this.logger.debug(
          `transitioned part ${newEntity.id}/${newEntity.uuid} to status ${newEntity.status}`,
        );

        return newEntity;
      },
    );

    // attempt to delete the old part
    if (deletedPartContainer.contained) {
      this.logger.debug(
        `attempting to delete replaced upload part ${deletedPartContainer.contained.id}/${deletedPartContainer.contained.uuid}`,
      );

      // not that attempting to delete a part requires a lock
      await attempt(
        async () =>
          this.lockService.executeLocking(
            async lock =>
              this.deletePartContent(
                activeSession,
                deletedPartContainer.contained!,
                lock,
              ),
            {
              // attempting a weak lock acquisition
              resourceCode: this.sessionLockToken(activeSession),
              duration: 1 * 60 * 1000, // 1 min for part cleanup
              timeout: 3 * 1000, // only wait for 3 secs
            },
          ),
        result => {
          if (result.error) {
            this.logger.error(
              'error attempting to cleanup replaced uploaded part',
              result.error,
            );
          }
        },
      );
    }

    // return the newly succesfully created part entity
    return createdEntity;
  }

  private validateUploadedContentPart(
    request: RawUploadDto,
  ): UploadedContentPart {
    if (!request) {
      throw new HttpErrors.BadRequest();
    }

    // support only a single content at the moment
    if (request.files.length < 1) {
      throw new HttpErrors.BadRequest('No content provided');
    } else if (request.files.length > 1) {
      throw new HttpErrors.BadRequest(
        'Multiple content is not supported at the moment',
      );
    }

    const file = request.files[0];

    if (!file.path && !file.content?.length) {
      throw new HttpErrors.BadRequest('File content could not be localized');
    }
    if (!file.size && !file.content?.length) {
      throw new HttpErrors.BadRequest('File size could not be retrieved');
    }

    let providedHashes: UploadedContentHashes | undefined = undefined;
    for (const possibleKey of supportedHashesList) {
      if (request.fields[possibleKey]) {
        if (!providedHashes) {
          providedHashes = {};
        }
        providedHashes[possibleKey] = request.fields[possibleKey].trim();
      }
    }

    // check the limits
    if (file.size > this.configuration.limits.partSize) {
      throw new HttpErrors.BadRequest(
        `Part size of ${file.size} exceeds limit of ${this.configuration.limits.partSize}`,
      );
    }

    return {
      ...file,
      content: file.path
        ? ContentStreamer.fromPath(file.path)
        : ContentStreamer.fromBuffer(file.content!),
      hashes: providedHashes,
    };
  }

  public async finalizeUploadSession(
    sessionUUID: string,
  ): Promise<CreateContentResponse> {
    // look for session
    const activeSession = await this.getActiveSessionByUUID(sessionUUID);

    if (!activeSession) {
      throw new HttpErrors.NotFound(
        'Upload session ' + sessionUUID + ' does not exist',
      );
    }

    return this.lockService.executeLocking(
      async lock => this.finalizeUploadSessionInLock(activeSession, lock),
      {
        resourceCode: this.sessionLockToken(activeSession),
        duration: 30 * 60 * 1000,
        timeout: 5 * 1000,
      },
    );
  }

  public async abortUploadSession(sessionUUID: string): Promise<void> {
    // look for session
    const activeSession = await this.getActiveSessionByUUID(sessionUUID);

    if (!activeSession) {
      throw new HttpErrors.NotFound(
        'Upload session ' + sessionUUID + ' does not exist',
      );
    }

    return this.lockService.executeLocking(
      async lock => this.abortUploadSessionInLock(activeSession, lock),
      {
        resourceCode: this.sessionLockToken(activeSession),
        duration: 5 * 60 * 1000,
        timeout: 5 * 1000,
      },
    );
  }

  private async abortUploadSessionInLock(
    activeSession: UploadSession,
    lock: ResourceLock,
  ): Promise<void> {
    this.logger.debug(
      `requested abortion for session ${activeSession.id}/${activeSession.uuid} currently in status ${activeSession.status}`,
    );

    // require lock on the resource to do this.
    if (lock.resourceCode !== this.sessionLockToken(activeSession)) {
      throw new HttpErrors.Conflict(
        'Lock on upload session is required for session abort',
      );
    }

    // check that session is ACTIVE
    this.requireStatus(activeSession, [UploadSessionStatus.ACTIVE]);

    // move entity to deleted status (not in transaction)
    activeSession.status = UploadSessionStatus.DELETED;
    activeSession.transitionedAt = new Date();
    await this.uploadSessionRepository.update(activeSession);
    this.logger.debug(
      `transitioned upload session ${activeSession.id}/${activeSession.uuid} to status ${activeSession.status}`,
    );

    // attempt immediate cleanup
    await attempt(
      async () => this.cleanupSession(activeSession, lock),
      cleanupResult => {
        if (cleanupResult.error) {
          this.logger.error(
            `error attempting to cleanup aborted session ${activeSession.id}/${activeSession.uuid}`,
            cleanupResult.error,
          );
        }
      },
    );
  }

  private async finalizeUploadSessionInLock(
    activeSession: UploadSession,
    lock: ResourceLock,
  ): Promise<CreateContentResponse> {
    // require lock on the resource to do this.
    if (lock.resourceCode !== this.sessionLockToken(activeSession)) {
      throw new HttpErrors.Conflict(
        'Lock on upload session is required for cleanup',
      );
    }

    this.requireStatus(activeSession, UploadSessionStatus.ACTIVE);

    // gather parts
    const parts = await this.uploadSessionPartRepository.find({
      where: {
        sessionId: activeSession.id,
        status: UploadSessionPartStatus.ACTIVE,
      },
      order: ['partNumber ASC'],
    });

    // check that we have some parts
    if (!parts.length) {
      throw new HttpErrors.BadRequest(
        'No parts have been uploaded for this upload session',
      );
    }

    // check that we don't have too many parts
    if (parts.length > this.configuration.limits.parts) {
      throw new HttpErrors.BadRequest(
        `Too many parts have been uploaded for this upload session ` +
          `(${parts.length} over the limit of ${this.configuration.limits.parts})`,
      );
    }

    // check part numbers
    let currentPartNumber = parts[0].partNumber;
    if (currentPartNumber < 0 || currentPartNumber > 1) {
      throw new HttpErrors.BadRequest('Part numbers must start from 0 or 1');
    }
    let partCounter = 0;
    for (const part of parts) {
      if (part.partNumber === currentPartNumber) {
        currentPartNumber++;
        partCounter++;
      } else {
        throw new HttpErrors.BadRequest(
          `Part numbers must be in order. Part number ${partCounter} was expected to have number ${currentPartNumber} but was ${part.partNumber}`,
        );
      }
    }

    // check total parts size
    let totalPartsSize = 0;
    for (const part of parts) {
      totalPartsSize += part.size;
    }

    if (totalPartsSize !== activeSession.contentSize) {
      throw new HttpErrors.BadRequest(
        `The total size of the uploaded parts is different from the declared overall size ` +
          `(effective ${totalPartsSize} bytes differs from the declared ${activeSession.contentSize} bytes)`,
      );
    }

    // check that final size is not over limit
    if (totalPartsSize > this.configuration.limits.totalSize) {
      throw new HttpErrors.BadRequest(
        `Too many bytes have been uploaded for this upload session ` +
          `(${totalPartsSize} bytes over the limit of ${this.configuration.limits.totalSize} bytes)`,
      );
    }

    // fetch node and tenant
    const node = await this.storageNodeService.fetchById(activeSession.nodeId!);
    if (!node || node.status !== NodeStatus.ACTIVE) {
      throw new HttpErrors.Conflict(
        'The target node could not be found or is not writable at the moment.',
      );
    }

    const tenant = await this.clientTenantService.fetchById(node.tenantId);
    if (!tenant) {
      throw new HttpErrors.Conflict(
        'The specified node tenant is no longer active',
      );
    }

    // build content provider from composite stream
    const contentToReplace: UploadedContent = {
      content: ContentStreamer.fromStreamProvider(async () => {
        // create read stream from parts
        return this.createReadStreamFromParts(activeSession, parts);
      }),
      size: activeSession.contentSize,
      encoding: activeSession.encoding,
      mimetype: activeSession.mimeType,
      originalname: activeSession.originalName,
      version: activeSession.version,
      hashes: {
        md5: activeSession.md5,
        sha1: activeSession.sha1,
        sha256: activeSession.sha256,
      },
    };

    // open transaction
    const result = await this.uploadSessionRepository.inTransaction(
      async transaction => {
        // move entity in finalizing status
        activeSession.status = UploadSessionStatus.FINALIZING;
        activeSession.transitionedAt = new Date();
        await this.uploadSessionRepository.update(activeSession, {transaction});
        this.logger.debug(
          `transitioned upload session ${activeSession.id}/${activeSession.uuid} to status ${activeSession.status}`,
        );

        // do content replace via content manager
        const resultInner = await this.contentService.createOrUpdateContent(
          tenant,
          node,
          contentToReplace,
          transaction,
        );

        // move entity in finalized status
        activeSession.status = UploadSessionStatus.FINALIZED;
        activeSession.transitionedAt = new Date();
        await this.uploadSessionRepository.update(activeSession, {transaction});
        this.logger.debug(
          `transitioned upload session ${activeSession.id}/${activeSession.uuid} to status ${activeSession.status}`,
        );

        return resultInner;
      },
    );

    // closed transaction. attempt a cleanup of the session right now
    await attempt(
      async () => this.cleanupSession(activeSession, lock),
      cleanupResult => {
        if (cleanupResult.error) {
          this.logger.error(
            `error attempting to cleanup finalized session ${activeSession.id}/${activeSession.uuid}`,
            cleanupResult.error,
          );
        }
      },
    );

    // return the DTO for the newly created content
    return result.dto;
  }

  private async cleanupSession(
    session: UploadSession,
    lock: ResourceLock,
  ): Promise<boolean> {
    // require lock on the resource to do this.
    if (lock.resourceCode !== this.sessionLockToken(session)) {
      throw new HttpErrors.Conflict(
        'Lock on upload session is required for cleanup',
      );
    }

    this.logger.debug(
      `attempting to cleanup session ${session.id}/${session.uuid} currently in status ${session.status}`,
    );

    // require finalized or deleted status in order to proceed
    this.requireStatus(session, [
      UploadSessionStatus.FINALIZED,
      UploadSessionStatus.DELETED,
    ]);

    // set all parts to DELETED
    let massUpdateResult = await this.uploadSessionPartRepository.updateAll(
      {
        status: UploadSessionPartStatus.DELETED,
        transitionedAt: new Date(),
      },
      {
        sessionId: session.id,
      },
    );
    this.logger.debug(
      `transitioned ${massUpdateResult.count} upload part records to deleted status`,
    );

    // clear upload folder
    const folders = this.buildUploadLocation(session);
    this.logger.debug(
      `deleting whole upload session folder at ${folders.session}`,
    );
    fs.removeSync(folders.session);
    this.logger.verbose(`deleted upload session folder at ${folders.session}`);

    // set all parts to CLEARED
    massUpdateResult = await this.uploadSessionPartRepository.updateAll(
      {
        status: UploadSessionPartStatus.CLEARED,
        transitionedAt: new Date(),
      },
      {
        sessionId: session.id,
      },
    );
    this.logger.debug(
      `transitioned ${massUpdateResult.count} upload part records to cleared status`,
    );

    // move entity in cleared status
    session.status = UploadSessionStatus.CLEARED;
    session.transitionedAt = new Date();
    await this.uploadSessionRepository.update(session);
    this.logger.debug(
      `transitioned upload session ${session.id}/${session.uuid} to status ${session.status}`,
    );

    return true;
  }

  private async deletePartContent(
    session: UploadSession,
    part: UploadSessionPart,
    lock: ResourceLock,
  ): Promise<boolean> {
    if (lock.resourceCode !== this.sessionLockToken(session)) {
      throw new HttpErrors.Conflict(
        'Lock on upload session is required for partial cleanup',
      );
    }

    this.requireStatus(part, UploadSessionPartStatus.DELETED);

    const paths = this.buildUploadLocation(session, part);
    const pathToDelete = ObjectUtils.requireNotNull(paths.part);

    if (fs.existsSync(pathToDelete)) {
      this.logger.verbose(`deleting path ${pathToDelete} with its content`);
      await fs.remove(pathToDelete);
    }

    part.status = UploadSessionPartStatus.CLEARED;
    part.transitionedAt = new Date();
    await this.uploadSessionPartRepository.update(part);
    this.logger.debug(
      `transitioned part ${part.id}/${part.uuid} to status ${part.status}`,
    );

    return true;
  }

  private createReadStreamFromParts(
    session: UploadSession,
    parts: UploadSessionPart[],
  ): Readable {
    this.logger.debug(
      `creating composite read stream from ${parts.length} uploaded parts`,
    );

    let count = 0;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const factory: FactoryStream = (cb: any) => {
      if (count >= parts.length) {
        this.logger.debug(
          `terminating composite read stream as all ${parts.length} file have been streamed`,
        );
        return cb(null, null);
      }
      const part = parts[count++];
      const logger = this.logger;
      const builtPath = this.buildUploadLocation(session, part);
      setTimeout(function () {
        logger.debug(
          `opening part ${count}/${parts.length} for read stream from ${builtPath.part}`,
        );
        cb(null, fs.createReadStream(builtPath.part!));
      }, 1);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder = multistream as any;
    const createdStream = new builder(factory) as NodeJS.ReadableStream;

    return new Readable().wrap(createdStream);
  }

  private requireStatus(
    entity: UploadSession | UploadSessionPart,
    statuses:
      | UploadSessionStatus
      | UploadSessionPartStatus
      | (UploadSessionStatus | UploadSessionPartStatus)[],
  ): void {
    if (!Array.isArray(statuses)) {
      statuses = [statuses];
    }
    if (!(statuses as string[]).includes(entity.status)) {
      throw new HttpErrors.Conflict(
        `Action not permitted because current status ${
          entity.status
        } is different from required status ${statuses.join(', ')}`,
      );
    }
  }

  private sessionLockToken(session: UploadSession): string {
    return `uploadSession.${session.uuid}`;
  }

  public async getPurgeCandidates(
    page: Pageable,
  ): Promise<Page<UploadSession>> {
    const now = new Date();
    const anHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    return this.uploadSessionRepository.findPage(
      {
        where: {
          or: [
            {
              // active or finalizing and expired more than an hour ago
              status: {
                inq: [
                  UploadSessionStatus.ACTIVE,
                  UploadSessionStatus.FINALIZING,
                ],
              },
              expiresAt: {
                neq: null as unknown as Date,
                lte: anHourAgo,
              },
            },
            {
              // finalized or deleted more than an hour ago
              status: {
                inq: [
                  UploadSessionStatus.FINALIZED,
                  UploadSessionStatus.DELETED,
                ],
              },
              transitionedAt: {
                neq: null as unknown as Date,
                lte: anHourAgo,
              },
            },
          ],
        },
        order: ['id DESC'],
      },
      page,
    );
  }

  public async purgeClearedRecords(): Promise<void> {
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    let result = await this.uploadSessionPartRepository.deleteAll({
      // CLEARED at least 10 days ago
      status: {
        inq: [UploadSessionPartStatus.CLEARED],
      },
      transitionedAt: {
        neq: null as unknown as Date,
        lte: tenDaysAgo,
      },
    });

    if (result.count > 0) {
      this.logger.debug(
        `deleted ${result.count} old upload part records in cleared status`,
      );
    }

    result = await this.uploadSessionRepository.deleteAll({
      // CLEARED at least 10 days ago
      status: {
        inq: [UploadSessionStatus.CLEARED],
      },
      transitionedAt: {
        neq: null as unknown as Date,
        lte: tenDaysAgo,
      },
    });

    if (result.count > 0) {
      this.logger.debug(
        `deleted ${result.count} old upload session records in cleared status`,
      );
    }
  }

  public async purgeExpiredSession(session: UploadSession): Promise<void> {
    this.logger.debug(
      `attempting to purge session ${session.id}/${session.uuid} currently in status ${session.status}`,
    );

    await this.lockService.executeLocking(
      async lock => {
        if (session.status !== UploadSessionStatus.DELETED) {
          session.status = UploadSessionStatus.DELETED;
          session.transitionedAt = new Date();
          await this.uploadSessionRepository.update(session);
          this.logger.debug(
            `transitioned upload session ${session.id}/${session.uuid} to status ${session.status}`,
          );
        }

        await this.cleanupSession(session, lock);
      },
      {
        resourceCode: this.sessionLockToken(session),
        duration: 5 * 60 * 1000,
        timeout: 5 * 1000,
      },
    );
  }
}
