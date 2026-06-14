export type MetaSecretsBackend = "file" | "dynamodb" | "secrets-manager";

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
  s3VectorsBucketName?: string;
  s3VectorsEndpoint?: string;
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
  metaDevPageId?: string;
  metaDevPageAccessToken?: string;
  metaDevPageName?: string;
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
  secretsEndpoint?: string;
  secretsAccessKeyId?: string;
  secretsSecretAccessKey?: string;
  metaSecretsBackend?: MetaSecretsBackend;
  metaSecretsUseSecretsManager: boolean;
  metaSecretsPrefix: string;
  metaTokenRefreshCronSecret?: string;
  /** Template URL for Sri Lankan / external payment gateway redirect */
  paymentGatewayCheckoutUrl?: string;
  /** Shared secret for POST /webhooks/payment (gateway callback) */
  paymentWebhookSecret?: string;
  /** Dev only: auto-activate plan on checkout without payment */
  billingSkipPayment: boolean;
}

function parseMetaSecretsBackend(): MetaSecretsBackend | undefined {
  const raw = process.env.META_SECRETS_BACKEND?.trim().toLowerCase();
  if (raw === "dynamodb" || raw === "secrets-manager" || raw === "file") return raw;
  return undefined;
}

export function loadConfig(): CoreConfig {
  return {
    tableName: process.env.TABLE_NAME ?? "CommerceChat-Main",
    jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-in-production",
    jwtIssuer: process.env.JWT_ISSUER ?? "commercechat.com",
    accessTokenTtlSec: Number(process.env.ACCESS_TOKEN_TTL_SEC ?? 3600),
    refreshTokenTtlSec: Number(process.env.REFRESH_TOKEN_TTL_SEC ?? 2592000),
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
    awsRegion: process.env.AWS_REGION ?? process.env.AWS_REGION_NAME ?? "us-east-1",
    dynamoEndpoint: process.env.DYNAMODB_ENDPOINT,
    dataDir: process.env.DATA_DIR ?? ".data",
    s3VectorsBucketName: process.env.S3_VECTORS_BUCKET,
    s3VectorsEndpoint: process.env.S3_VECTORS_ENDPOINT,
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
    metaDevPageId: process.env.META_DEV_PAGE_ID,
    metaDevPageAccessToken: process.env.META_DEV_PAGE_ACCESS_TOKEN,
    metaDevPageName: process.env.META_DEV_PAGE_NAME,
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
    secretsEndpoint: process.env.SECRETS_MANAGER_ENDPOINT,
    secretsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    metaSecretsBackend: parseMetaSecretsBackend(),
    metaSecretsUseSecretsManager: process.env.META_SECRETS_USE_SECRETS_MANAGER === "true",
    metaSecretsPrefix: process.env.META_SECRETS_PREFIX ?? "commercechat",
    metaTokenRefreshCronSecret: process.env.META_TOKEN_REFRESH_CRON_SECRET,
    paymentGatewayCheckoutUrl: process.env.PAYMENT_GATEWAY_CHECKOUT_URL,
    paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET,
    billingSkipPayment: process.env.BILLING_SKIP_PAYMENT === "true",
  };
}
