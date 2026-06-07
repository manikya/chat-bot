export interface CoreConfig {
  tableName: string;
  jwtSecret: string;
  jwtIssuer: string;
  accessTokenTtlSec: number;
  refreshTokenTtlSec: number;
  appUrl: string;
  awsRegion: string;
  dynamoEndpoint?: string;
}

export function loadConfig(): CoreConfig {
  return {
    tableName: process.env.TABLE_NAME ?? "CommerceChat-Main",
    jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-in-production",
    jwtIssuer: process.env.JWT_ISSUER ?? "commercechat.com",
    accessTokenTtlSec: Number(process.env.ACCESS_TOKEN_TTL_SEC ?? 3600),
    refreshTokenTtlSec: Number(process.env.REFRESH_TOKEN_TTL_SEC ?? 2592000),
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
    awsRegion: process.env.AWS_REGION ?? "us-east-1",
    dynamoEndpoint: process.env.DYNAMODB_ENDPOINT,
  };
}
