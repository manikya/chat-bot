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
  metaDevAccessToken?: string;
  metaDevWabaId?: string;
  metaDevPhoneNumberId?: string;
  metaDevDisplayPhone?: string;
  skipEmailVerification: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  s3Endpoint?: string;
  s3Bucket?: string;
  s3PublicUrl?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
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
    metaDevAccessToken: process.env.META_DEV_ACCESS_TOKEN,
    metaDevWabaId: process.env.META_DEV_WABA_ID,
    metaDevPhoneNumberId: process.env.META_DEV_PHONE_NUMBER_ID,
    metaDevDisplayPhone: process.env.META_DEV_DISPLAY_PHONE,
    skipEmailVerification: process.env.SKIP_EMAIL_VERIFICATION === "true",
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpFrom: process.env.SMTP_FROM,
    s3Endpoint: process.env.S3_ENDPOINT ?? process.env.AWS_ENDPOINT_URL,
    s3Bucket: process.env.S3_BUCKET ?? process.env.S3_ASSETS_BUCKET,
    s3PublicUrl: process.env.S3_PUBLIC_URL,
    s3AccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    s3SecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}
