import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {get, param, post, Response, RestBindings} from '@loopback/rest';
import {SecurityBindings} from '@loopback/security';
import {Security} from '../../security';
import {ClientProfile} from '../../services';
import {MsGraphTestService} from '../../services/onedrive/msgraph-test.service';
import {MsGraphTokenService} from '../../services/onedrive/msgraph-token.service';
import {OnedriveCleanupManager} from '../../services/onedrive/onedrive-cleanup-manager.service';

export class OnedriveController {
  constructor(
    @inject(RestBindings.Http.RESPONSE) private res: Response,
    @inject(SecurityBindings.USER, {optional: true})
    private client: ClientProfile,
    @service(MsGraphTokenService)
    private msgraphTokenService: MsGraphTokenService,
    @service(MsGraphTestService) private msgraphTestService: MsGraphTestService,
    @service(OnedriveCleanupManager)
    private onedriveCleanupManager: OnedriveCleanupManager,
  ) {}

  @authenticate({
    strategy: 'token',
    options: {required: Security.SCOPES.PLATFORM_ADMIN},
  })
  @get('/onedrive/authorize')
  authorize(
    @param.query.boolean('redirect', {required: false})
    redirect: boolean | undefined = undefined,
  ) {
    const url = this.msgraphTokenService.getAuthorizationUrl(this.client);
    if (redirect) {
      this.res.status(302);
      this.res.header('Location', url);
      this.res.send();
    } else {
      return {
        url,
      };
    }
  }

  @get('/onedrive/cb')
  async callback(
    @param.query.string('code') code: string,
    @param.query.string('state') state: string,
  ): Promise<object> {
    const entity = await this.msgraphTokenService.redeem(code, state);
    return {
      id: entity.id,
    };
  }

  @authenticate({
    strategy: 'token',
    options: {required: Security.SCOPES.PLATFORM_ADMIN},
  })
  @get('/onedrive/check-token')
  async checkToken(): Promise<object> {
    const result = await this.msgraphTokenService.check();
    return result;
  }

  @authenticate({
    strategy: 'token',
    options: {required: Security.SCOPES.PLATFORM_ADMIN},
  })
  @get('/onedrive/tenants')
  async getTenants(): Promise<object> {
    const result = await this.msgraphTestService.getTenants();
    return result;
  }

  @authenticate({
    strategy: 'token',
    options: {required: Security.SCOPES.PLATFORM_ADMIN},
  })
  @post('/onedrive/cleanup')
  async cleanup(): Promise<object> {
    const res = await this.onedriveCleanupManager.cleanupAll({preview: false});
    return {
      done: true,
      result: res,
    };
  }

  @authenticate({
    strategy: 'token',
    options: {required: Security.SCOPES.PLATFORM_ADMIN},
  })
  @post('/onedrive/cleanup-preview')
  async cleanupPreview(): Promise<object> {
    const res = await this.onedriveCleanupManager.cleanupAll({preview: true});
    return {
      done: true,
      result: res,
    };
  }
}
