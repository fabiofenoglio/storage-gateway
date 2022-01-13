export namespace Security {
  export enum SCOPES {
    DOC_USAGE = 'storage_gateway.usage',
    PLATFORM_ADMIN = 'storage_gateway.admin',
  }

  export enum AuthenticationMethod {
    BASIC = 'BASIC',
    TOKEN = 'TOKEN',
  }

  export enum Permissions {
    OWNER = 'OWNER',
    WRITE = 'WRITE',
    READ = 'READ',
  }
}

export interface ClientAuthenticationRequirements {
  context: string;
  required?: string;
}

export interface TokenClientAuthenticationStrategyCredentials {
  token: string;
}
