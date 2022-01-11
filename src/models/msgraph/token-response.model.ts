/* eslint-disable @typescript-eslint/no-explicit-any */

export class MsGraphTokenResponse {
  tokenType: string;
  scope: string[];
  expiresIn: number;
  extExpiresIn?: number;
  accessToken: string;
  refreshToken: string;
  state?: string;

  constructor(data: any) {
    if (data && data instanceof MsGraphTokenResponse) {
      Object.assign(this, data);
    } else {
      Object.assign(this, {
        tokenType: data['token_type'] as string,
        scope: (data['scope'] ?? '').split(' '),
        expiresIn: data['expires_in'],
        extExpiresIn: data['ext_expires_in'],
        accessToken: data['access_token'],
        refreshToken: data['refresh_token'],
        state: data['state'],
      });
    }
  }
}
