export interface CoreConfig {
  tableName: string;
  jwtSecret: string;
  jwtIssuer: string;
  accessTokenTtlSec: number;
  refreshTokenTtlSec: number;
  appUrl: string;
  awsRegion: string;
  dynamoEndpoint?: string;
  dataDir: string;
  openaiApiKey?: string;
  embeddingModel: string;
  llmModel: string;
  ingestMaxPages: number;
  apiPublicUrl: string;
  metaAppId?: string;
  metaAppSecret?: string;
  metaVerifyToken?: string;
  metaGraphVersion: string;
  metaOAuthRedirectUri?: string;
  skipEmailVerification: boolean;
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
    dataDir: process.env.DATA_DIR ?? ".data",
    openaiApiKey: process.env.OPENAI_API_KEY,
    embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
    llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
    ingestMaxPages: Number(process.env.INGEST_MAX_PAGES ?? 50),
    apiPublicUrl: process.env.API_PUBLIC_URL ?? "http://localhost:3001",
    metaAppId: process.env.META_APP_ID,
    metaAppSecret: process.env.META_APP_SECRET,
    metaVerifyToken: process.env.META_VERIFY_TOKEN,
    metaGraphVersion: process.env.META_GRAPH_VERSION ?? "v21.0",
    metaOAuthRedirectUri:
      process.env.META_OAUTH_REDIRECT_URI ??
      `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/channels/meta/callback`,
    skipEmailVerification: process.env.SKIP_EMAIL_VERIFICATION === "true",
  };
}
