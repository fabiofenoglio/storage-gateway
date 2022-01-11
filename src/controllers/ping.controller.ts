import {authenticate} from '@loopback/authentication';
import {inject, service} from '@loopback/core';
import {get, Request, ResponseObject, RestBindings} from '@loopback/rest';
import {SecurityBindings} from '@loopback/security';
import {ClientProfile} from '../services';
import {MonitoringService} from '../services/monitoring/monitoring.service';

const OAS_CONTROLLER_NAME = 'Public';

/**
 * OpenAPI response for ping()
 */
const PING_RESPONSE: ResponseObject = {
  description: 'Ping Response',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        title: 'PingResponse',
        properties: {
          pong: {type: 'string'},
          date: {type: 'string'},
          url: {type: 'string'},
          headers: {
            type: 'object',
            properties: {
              'Content-Type': {type: 'string'},
            },
            additionalProperties: true,
          },
        },
      },
    },
  },
};

/**
 * A simple controller to bounce back http requests
 */
export class PingController {
  constructor(
    @inject(RestBindings.Http.REQUEST) private req: Request,
    @inject(SecurityBindings.USER, {optional: true})
    private client: ClientProfile,
    @service(MonitoringService)
    private monitoringService: MonitoringService,
  ) {}

  // Map to `GET /ping`
  @get('/ping', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'ping',
    responses: {
      '200': PING_RESPONSE,
    },
  })
  ping(): object {
    return {
      pong: 'pong',
      date: new Date(),
      url: this.req.url,
      // headers: Object.assign({}, this.req.headers),
    };
  }

  @get('/whoAmI', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'whoAmI',
    responses: {
      '200': {
        description: 'WhoAmI Response',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              title: 'WhoAmIResponse',
              properties: {
                code: {type: 'string'},
              },
            },
          },
        },
      },
    },
  })
  @authenticate({strategy: 'token'})
  whoAmI(): object {
    // Reply with a greeting, the current time, the url, and request headers
    return {
      ...this.client,
    };
  }

  @get('/status', {
    'x-controller-name': OAS_CONTROLLER_NAME,
    operationId: 'getStatus',
    responses: {
      '200': {
        description: 'Status Response',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              title: 'StatusResponse',
              properties: {
                status: {type: 'string'},
                date: {type: 'string'},
              },
            },
          },
        },
      },
    },
  })
  async status(): Promise<object> {
    return this.monitoringService.getStatus();
  }
}
