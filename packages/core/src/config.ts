export type MetaSecretsBackend = "file" | "dynamodb";

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
  s3VectorsAccessKeyId?: string;
  s3VectorsSecretAccessKey?: string;
  openaiApiKey?: string;
  embeddingModel: string;
  llmModel: string;
  plannerModel?: string;
  catalogIntelligenceModel?: string;
  escalationModel?: string;
  aiWalletUsdToLkr?: number;
  aiWalletMarkupPct?: number;
  aiWalletLowBalanceMinor?: number;
  ingestMaxPages: number;
  apiPublicUrl: string;
  widgetCdnUrl?: string;
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
  s3DataBucket?: string;
  s3PublicUrl?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  metaSecretsBackend?: MetaSecretsBackend;
  metaSecretsPrefix: string;
  metaTokenRefreshCronSecret?: string;
  billingLifecycleCronSecret?: string;
  socialContentCronSecret?: string;
  /** Template URL for Sri Lankan / external payment gateway redirect */
  paymentGatewayCheckoutUrl?: string;
  /** Shared secret for POST /webhooks/payment (gateway callback) */
  paymentWebhookSecret?: string;
  /** Dev only: auto-activate plan on checkout without payment */
  billingSkipPayment: boolean;
  ingestQueueUrl?: string;
  ingestStateMachineArn?: string;
}

function parseMetaSecretsBackend(): MetaSecretsBackend | undefined {
  const raw = process.env.META_SECRETS_BACKEND?.trim().toLowerCase();
  if (raw === "dynamodb" || raw === "file") return raw;
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
    s3VectorsAccessKeyId: process.env.S3_VECTORS_AWS_ACCESS_KEY_ID,
    s3VectorsSecretAccessKey: process.env.S3_VECTORS_AWS_SECRET_ACCESS_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
    llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
    plannerModel: process.env.PLANNER_MODEL,
    catalogIntelligenceModel: process.env.CATALOG_INTELLIGENCE_MODEL,
    escalationModel: process.env.ESCALATION_MODEL,
    aiWalletUsdToLkr: Number(process.env.AI_WALLET_USD_TO_LKR ?? 310),
    aiWalletMarkupPct: Number(process.env.AI_WALLET_MARKUP_PCT ?? 30),
    aiWalletLowBalanceMinor: Number(process.env.AI_WALLET_LOW_BALANCE_MINOR ?? 50000),
    ingestMaxPages: Number(process.env.INGEST_MAX_PAGES ?? 50),
    apiPublicUrl: process.env.API_PUBLIC_URL ?? "http://localhost:3001",
    widgetCdnUrl: process.env.WIDGET_CDN_URL,
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
    s3DataBucket: process.env.S3_DATA_BUCKET,
    s3PublicUrl: process.env.S3_PUBLIC_URL,
    s3AccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    s3SecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    metaSecretsBackend: parseMetaSecretsBackend(),
    metaSecretsPrefix: process.env.META_SECRETS_PREFIX ?? "commercechat",
    metaTokenRefreshCronSecret: process.env.META_TOKEN_REFRESH_CRON_SECRET,
    billingLifecycleCronSecret: process.env.BILLING_LIFECYCLE_CRON_SECRET,
    socialContentCronSecret: process.env.SOCIAL_CONTENT_CRON_SECRET,
    paymentGatewayCheckoutUrl: process.env.PAYMENT_GATEWAY_CHECKOUT_URL,
    paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET,
    billingSkipPayment: process.env.BILLING_SKIP_PAYMENT === "true",
    ingestQueueUrl: process.env.INGEST_QUEUE_URL,
    ingestStateMachineArn: process.env.INGEST_STATE_MACHINE_ARN,
  };
}
