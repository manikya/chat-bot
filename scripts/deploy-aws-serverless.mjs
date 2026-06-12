#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const API_DIR = join(ROOT, "apps/api");
const BUILD_DIR = join(API_DIR, "dist/handlers");
const OUT_DIR = join(ROOT, ".aws-deploy");
const INVENTORY_DIR = join(ROOT, "infra/deployments");

const ROUTES = [
  ["GET", "/health", "health"],
  ["GET", "/webhooks/meta", "webhook-meta"],
  ["POST", "/webhooks/meta", "webhook-meta"],
  ["POST", "/webhooks/payment", "webhook-payment"],
  ["GET", "/api/v1/billing/plans", "billing", "plansHandler"],
  ["GET", "/api/v1/billing/subscription", "billing", "subscriptionHandler"],
  ["GET", "/api/v1/billing/overview", "billing", "overviewHandler"],
  ["POST", "/api/v1/billing/checkout", "billing", "checkoutHandler"],
  ["POST", "/auth/signup", "auth-signup"],
  ["POST", "/auth/login", "auth-login"],
  ["GET", "/auth/me", "auth-me"],
  ["POST", "/auth/verify-email", "auth-verify-email"],
  ["POST", "/auth/refresh", "auth-refresh"],
  ["POST", "/auth/logout", "auth-logout"],
  ["POST", "/auth/forgot-password", "auth-forgot-password"],
  ["POST", "/auth/reset-password", "auth-reset-password"],
  ["POST", "/auth/resend-verification", "auth-resend-verification"],
  ["POST", "/auth/invite", "auth-invite"],
  ["POST", "/auth/accept-invite", "auth-accept-invite"],
  ["GET", "/api/v1/tenants/me", "tenant-me"],
  ["PATCH", "/api/v1/tenants/me", "tenant-me"],
  ["POST", "/api/v1/tenants/me/logo", "tenant-logo"],
  ["POST", "/api/v1/tenants/me/logo/presign", "tenant-logo-presign", "presignHandler"],
  ["POST", "/api/v1/tenants/me/logo/complete", "tenant-logo-presign", "completeHandler"],
  ["GET", "/api/v1/tenants/me/config", "tenant-config"],
  ["PATCH", "/api/v1/tenants/me/config", "tenant-config"],
  ["GET", "/api/v1/tenants/me/limits", "tenant-limits"],
  ["GET", "/api/v1/tenants/me/usage", "tenant-usage"],
  ["POST", "/api/v1/tenants/me/widget/regenerate-key", "tenant-widget-key"],
  ["GET", "/api/v1/conversations", "conversations"],
  ["GET", "/api/v1/conversations/{conversationId}", "conversations"],
  ["GET", "/api/v1/conversations/{conversationId}/messages", "conversations"],
  ["GET", "/api/v1/widget/config", "widget", "configHandler"],
  ["POST", "/api/v1/widget/chat", "widget", "chatHandler"],
  ["POST", "/api/v1/widget/chat/stream", "widget", "streamHandler"],
  ["POST", "/api/v1/chat", "chat-api"],
  ["GET", "/api/v1/onboarding", "onboarding"],
  ["PATCH", "/api/v1/onboarding/step", "onboarding"],
  ["POST", "/api/v1/onboarding/test-chat", "onboarding-test-chat"],
  ["GET", "/api/v1/knowledge/sources", "knowledge-sources"],
  ["POST", "/api/v1/knowledge/sources", "knowledge-sources"],
  ["DELETE", "/api/v1/knowledge/sources/{sourceId}", "knowledge-sources"],
  ["POST", "/api/v1/knowledge/sources/{sourceId}/sync", "knowledge-sync"],
  ["GET", "/api/v1/knowledge/jobs", "knowledge-jobs"],
  ["GET", "/api/v1/knowledge/jobs/{jobId}", "knowledge-jobs"],
  ["POST", "/api/v1/knowledge/faq", "knowledge-faq"],
  ["GET", "/api/v1/commerce/products", "commerce-products"],
  ["GET", "/api/v1/commerce/wordpress/status", "commerce-wordpress", "statusHandler"],
  ["POST", "/api/v1/commerce/wordpress/connect", "commerce-wordpress", "connectHandler"],
  ["POST", "/api/v1/commerce/wordpress/sync", "commerce-wordpress", "syncHandler"],
  ["DELETE", "/api/v1/commerce/wordpress", "commerce-wordpress", "disconnectHandler"],
  ["GET", "/api/v1/team", "team"],
  ["DELETE", "/api/v1/team/{userId}", "team-member", "deleteHandler"],
  ["PATCH", "/api/v1/team/{userId}", "team-member", "patchHandler"],
  ["GET", "/api/v1/dashboard/stats", "dashboard-stats"],
  ["GET", "/api/v1/channels", "channels", "listHandler"],
  ["POST", "/api/v1/channels/meta/connect", "channels", "connectHandler"],
  ["POST", "/api/v1/channels/meta/connect-messenger", "channels", "connectMessengerHandler"],
  ["POST", "/api/v1/channels/meta/connect-dev", "channels", "devConnectHandler"],
  ["POST", "/api/v1/channels/meta/connect-messenger-dev", "channels", "messengerDevConnectHandler"],
  ["GET", "/api/v1/channels/meta/dev-status", "channels", "devStatusHandler"],
  ["GET", "/api/v1/channels/meta/health", "channels", "healthHandler"],
  ["DELETE", "/api/v1/channels/meta/{channel}", "channels", "disconnectHandler"],
  ["POST", "/internal/cron/meta-token-refresh", "cron-meta-token-refresh"],
];

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function sh(cmd, args, options = {}) {
  try {
    return execFileSync(cmd, args, {
      cwd: options.cwd ?? ROOT,
      env: options.env ?? process.env,
      encoding: options.encoding ?? "utf8",
      stdio: options.stdio ?? "pipe",
    });
  } catch (err) {
    const status = typeof err === "object" && err && "status" in err ? err.status : "unknown";
    throw new Error(`${cmd} failed with exit code ${status}`);
  }
}

function parseCredentialsCsv(path) {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim();
  const [headerLine, valueLine] = text.split(/\r?\n/);
  if (!headerLine || !valueLine) throw new Error("AWS access key CSV is missing header or values");
  const headers = headerLine.split(",").map((h) => h.trim());
  const values = valueLine.split(",").map((v) => v.trim());
  const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  const accessKeyId = row["Access key ID"] || row["AWSAccessKeyId"] || row["Access key"];
  const secretAccessKey = row["Secret access key"] || row["AWSSecretKey"] || row["Secret key"];
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS access key CSV must include Access key ID and Secret access key");
  }
  return { accessKeyId, secretAccessKey };
}

function logicalId(prefix, name) {
  const cleaned = name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
  return `${prefix}${cleaned}`;
}

function resourceTags(env, component, costGroup, dataClass = "internal") {
  return [
    { Key: "Project", Value: "CommerceChat" },
    { Key: "Application", Value: "commercechat" },
    { Key: "Environment", Value: env },
    { Key: "ManagedBy", Value: "cloudformation" },
    { Key: "Owner", Value: "platform" },
    { Key: "Component", Value: component },
    { Key: "CostGroup", Value: costGroup },
    { Key: "DataClass", Value: dataClass },
  ];
}

function classifyHandler(handler) {
  if (handler.startsWith("auth") || handler.startsWith("tenant") || handler === "team" || handler === "team-member") {
    return { component: "api", costGroup: "core-api", dataClass: "customer" };
  }
  if (handler.startsWith("knowledge") || handler.startsWith("commerce")) {
    return { component: "ingest", costGroup: "knowledge-ingest", dataClass: "customer" };
  }
  if (handler.includes("chat") || handler === "conversations") {
    return { component: "chat", costGroup: "chat-runtime", dataClass: "customer" };
  }
  if (handler === "widget") {
    return { component: "widget", costGroup: "widget-cdn", dataClass: "public" };
  }
  if (handler === "channels" || handler.includes("meta")) {
    return { component: "meta", costGroup: "meta-channels", dataClass: "secret" };
  }
  if (handler === "billing" || handler.includes("payment")) {
    return { component: "billing", costGroup: "billing", dataClass: "customer" };
  }
  return { component: "api", costGroup: "core-api", dataClass: "internal" };
}

function routeKey(method, path) {
  return `${method} ${path}`;
}

function buildTemplate({ env, region, artifactBucket, artifactPrefix, handlerFiles }) {
  const resources = {};
  const lambdaRole = "LambdaRole";
  const tableName = `commercechat-${env}-storage-main`;
  const assetsBucket = `commercechat-${env}-assets-\${AWS::AccountId}-\${AWS::Region}`;
  const dataBucket = `commercechat-${env}-data-\${AWS::AccountId}-\${AWS::Region}`;

  resources.MainTable = {
    Type: "AWS::DynamoDB::Table",
    Properties: {
      TableName: tableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: env === "prod" },
      Tags: resourceTags(env, "storage", "storage", "customer"),
    },
  };

  resources.AssetsBucket = {
    Type: "AWS::S3::Bucket",
    Properties: {
      BucketName: { "Fn::Sub": assetsBucket },
      CorsConfiguration: {
        CorsRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "PUT", "HEAD"],
            AllowedOrigins: ["*"],
            ExposedHeaders: ["ETag"],
            MaxAge: 3000,
          },
        ],
      },
      Tags: resourceTags(env, "widget", "widget-cdn", "public"),
    },
  };

  resources.DataBucket = {
    Type: "AWS::S3::Bucket",
    Properties: {
      BucketName: { "Fn::Sub": dataBucket },
      Tags: resourceTags(env, "storage", "storage", "customer"),
    },
  };

  resources[lambdaRole] = {
    Type: "AWS::IAM::Role",
    Properties: {
      RoleName: { "Fn::Sub": `commercechat-${env}-api-lambda-role-\${AWS::Region}` },
      AssumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      },
      ManagedPolicyArns: [
        "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      ],
      Policies: [
        {
          PolicyName: "commercechat-app-access",
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: [
                  "dynamodb:GetItem",
                  "dynamodb:PutItem",
                  "dynamodb:UpdateItem",
                  "dynamodb:DeleteItem",
                  "dynamodb:Query",
                  "dynamodb:Scan",
                  "dynamodb:TransactWriteItems",
                ],
                Resource: [
                  { "Fn::GetAtt": ["MainTable", "Arn"] },
                  { "Fn::Sub": "${MainTable.Arn}/index/*" },
                ],
              },
              {
                Effect: "Allow",
                Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
                Resource: [
                  { "Fn::GetAtt": ["AssetsBucket", "Arn"] },
                  { "Fn::Sub": "${AssetsBucket.Arn}/*" },
                  { "Fn::GetAtt": ["DataBucket", "Arn"] },
                  { "Fn::Sub": "${DataBucket.Arn}/*" },
                ],
              },
              {
                Effect: "Allow",
                Action: [
                  "secretsmanager:GetSecretValue",
                  "secretsmanager:PutSecretValue",
                  "secretsmanager:CreateSecret",
                  "secretsmanager:UpdateSecret",
                  "secretsmanager:TagResource",
                ],
                Resource: { "Fn::Sub": "arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:commercechat/*" },
              },
            ],
          },
        },
      ],
      Tags: resourceTags(env, "security", "security", "internal"),
    },
  };

  resources.HttpApi = {
    Type: "AWS::ApiGatewayV2::Api",
    Properties: {
      Name: `commercechat-${env}-api-http`,
      ProtocolType: "HTTP",
      CorsConfiguration: {
        AllowHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Requested-With"],
        AllowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        AllowOrigins: ["*"],
      },
      Tags: Object.fromEntries(resourceTags(env, "api", "core-api", "public").map((t) => [t.Key, t.Value])),
    },
  };

  resources.ApiStage = {
    Type: "AWS::ApiGatewayV2::Stage",
    Properties: {
      ApiId: { Ref: "HttpApi" },
      StageName: "$default",
      AutoDeploy: true,
      Tags: Object.fromEntries(resourceTags(env, "api", "core-api", "public").map((t) => [t.Key, t.Value])),
    },
  };

  const functionDefs = new Map();
  for (const [, , file, exportName = "handler"] of ROUTES) {
    functionDefs.set(`${file}:${exportName}`, { file, exportName });
  }

  for (const { file: handlerName, exportName } of functionDefs.values()) {
    if (!handlerFiles.includes(handlerName)) {
      throw new Error(`Route references missing bundle: ${handlerName}.cjs`);
    }
    const suffix = exportName === "handler" ? handlerName : `${handlerName}-${exportName}`;
    const cls = classifyHandler(handlerName);
    const fnId = logicalId("Fn", suffix);
    const logId = logicalId("Log", suffix);
    const timeout =
      handlerName.includes("knowledge") || handlerName === "chat-api" || handlerName === "widget"
        ? 60
        : 20;
    const memory =
      handlerName.includes("knowledge") || handlerName === "chat-api" || handlerName === "widget"
        ? 1024
        : 512;

    resources[logId] = {
      Type: "AWS::Logs::LogGroup",
      Properties: {
        LogGroupName: { "Fn::Sub": `/aws/lambda/commercechat-${env}-${handlerName}` },
        RetentionInDays: env === "prod" ? 30 : 14,
        Tags: resourceTags(env, cls.component, cls.costGroup, cls.dataClass),
      },
    };

    resources[fnId] = {
      Type: "AWS::Lambda::Function",
      DependsOn: [logId],
      Properties: {
        FunctionName: `commercechat-${env}-${suffix}`,
        Runtime: "nodejs20.x",
        Architectures: ["arm64"],
        Handler: `${handlerName}.${exportName}`,
        Role: { "Fn::GetAtt": [lambdaRole, "Arn"] },
        Code: {
          S3Bucket: artifactBucket,
          S3Key: `${artifactPrefix}/${handlerName}.zip`,
        },
        Timeout: timeout,
        MemorySize: memory,
        Environment: {
          Variables: {
            TABLE_NAME: { Ref: "MainTable" },
            JWT_SECRET: { Ref: "JwtSecret" },
            JWT_ISSUER: "commercechat.com",
            APP_URL: { Ref: "AppUrl" },
            API_PUBLIC_URL: { Ref: "ApiPublicUrl" },
            AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
            AWS_REGION_NAME: region,
            S3_BUCKET: { Ref: "AssetsBucket" },
            S3_ASSETS_BUCKET: { Ref: "AssetsBucket" },
            S3_PUBLIC_URL: { Ref: "AssetsPublicUrl" },
            OPENAI_API_KEY: { Ref: "OpenAIApiKey" },
            META_APP_ID: { Ref: "MetaAppId" },
            META_APP_SECRET: { Ref: "MetaAppSecret" },
            META_VERIFY_TOKEN: { Ref: "MetaVerifyToken" },
            PAYMENT_WEBHOOK_SECRET: { Ref: "PaymentWebhookSecret" },
            BILLING_SKIP_PAYMENT: { Ref: "BillingSkipPayment" },
          },
        },
        Tags: resourceTags(env, cls.component, cls.costGroup, cls.dataClass),
      },
    };
  }

  const routeIndex = new Map();
  for (const [method, path, file, exportName = "handler"] of ROUTES) {
    const routeId = logicalId("Route", `${method}-${path}-${exportName}`);
    const integrationId = logicalId("Integration", `${file}-${exportName}`);
    const permissionId = logicalId("Permission", `${file}-${exportName}`);
    const fnId = logicalId("Fn", exportName === "handler" ? file : `${file}-${exportName}`);
    const integrationKey = `${file}:${exportName}`;

    if (!routeIndex.has(integrationKey)) {
      routeIndex.set(integrationKey, integrationId);
      resources[integrationId] = {
        Type: "AWS::ApiGatewayV2::Integration",
        Properties: {
          ApiId: { Ref: "HttpApi" },
          IntegrationType: "AWS_PROXY",
          IntegrationUri: { "Fn::GetAtt": [fnId, "Arn"] },
          PayloadFormatVersion: "2.0",
        },
      };
      resources[permissionId] = {
        Type: "AWS::Lambda::Permission",
        Properties: {
          Action: "lambda:InvokeFunction",
          FunctionName: { Ref: fnId },
          Principal: "apigateway.amazonaws.com",
          SourceArn: {
            "Fn::Sub": "arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${HttpApi}/*/*",
          },
        },
      };
    }

    resources[routeId] = {
      Type: "AWS::ApiGatewayV2::Route",
      Properties: {
        ApiId: { Ref: "HttpApi" },
        RouteKey: routeKey(method, path),
        Target: { "Fn::Sub": `integrations/\${${integrationId}}` },
      },
    };
  }

  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `CommerceChat ${env} serverless API stack`,
    Parameters: {
      JwtSecret: { Type: "String", NoEcho: true, MinLength: 16 },
      AppUrl: { Type: "String", Default: "http://localhost:3000" },
      ApiPublicUrl: { Type: "String", Default: "" },
      AssetsPublicUrl: { Type: "String", Default: "" },
      OpenAIApiKey: { Type: "String", NoEcho: true, Default: "" },
      MetaAppId: { Type: "String", Default: "" },
      MetaAppSecret: { Type: "String", NoEcho: true, Default: "" },
      MetaVerifyToken: { Type: "String", NoEcho: true, Default: "" },
      PaymentWebhookSecret: { Type: "String", NoEcho: true, Default: "" },
      BillingSkipPayment: { Type: "String", AllowedValues: ["true", "false"], Default: env === "prod" ? "false" : "true" },
    },
    Resources: resources,
    Outputs: {
      ApiEndpoint: { Value: { "Fn::GetAtt": ["HttpApi", "ApiEndpoint"] } },
      TableName: { Value: { Ref: "MainTable" } },
      AssetsBucketName: { Value: { Ref: "AssetsBucket" } },
      DataBucketName: { Value: { Ref: "DataBucket" } },
      DeploymentArtifactBucket: { Value: artifactBucket },
    },
  };
}

function zipHandlers(handlerFiles, artifactDir) {
  mkdirSync(artifactDir, { recursive: true });
  for (const handlerName of handlerFiles) {
    const bundle = join(BUILD_DIR, `${handlerName}.cjs`);
    if (!existsSync(bundle)) throw new Error(`Missing Lambda bundle: ${bundle}`);
    const zipPath = join(artifactDir, `${handlerName}.zip`);
    sh("zip", ["-j", "-q", zipPath, bundle]);
  }
}

function uploadArtifacts(handlerFiles, artifactDir, bucket, prefix, awsEnv) {
  for (const handlerName of handlerFiles) {
    sh("aws", [
      "s3",
      "cp",
      join(artifactDir, `${handlerName}.zip`),
      `s3://${bucket}/${prefix}/${handlerName}.zip`,
      "--only-show-errors",
    ], { env: awsEnv });
  }
}

function stackResources(stackName, awsEnv) {
  const json = sh("aws", [
    "cloudformation",
    "describe-stack-resources",
    "--stack-name",
    stackName,
  ], { env: awsEnv });
  return JSON.parse(json).StackResources ?? [];
}

function writeInventory({ stackName, env, region, artifactBucket, artifactPrefix, accountId, apiEndpoint, resources }) {
  mkdirSync(INVENTORY_DIR, { recursive: true });
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const inventoryPath = join(INVENTORY_DIR, `${stackName}-${now}.json`);
  const inventory = {
    createdAt: new Date().toISOString(),
    stackName,
    environment: env,
    region,
    accountId,
    apiEndpoint,
    artifactBucket,
    artifactPrefix,
    resources: resources.map((r) => ({
      logicalId: r.LogicalResourceId,
      physicalId: r.PhysicalResourceId,
      type: r.ResourceType,
      status: r.ResourceStatus,
    })),
    removal: {
      deleteStack: `aws cloudformation delete-stack --stack-name ${stackName} --region ${region}`,
      emptyAndDeleteArtifactBucket: [
        `aws s3 rm s3://${artifactBucket}/${artifactPrefix} --recursive --region ${region}`,
        `aws s3 rb s3://${artifactBucket} --force --region ${region}`,
      ],
      verifyDeletion: `aws cloudformation wait stack-delete-complete --stack-name ${stackName} --region ${region}`,
    },
  };
  writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  return inventoryPath;
}

async function main() {
  const credentialsCsv = arg("credentials-csv", "/Users/manikya/Downloads/manikya_accessKeys (1).csv");
  const env = arg("env", "dev");
  const region = arg("region", "us-east-1");
  const stackName = arg("stack", `commercechat-${env}`);
  const appUrl = arg("app-url", "http://localhost:3000");
  const openaiApiKey = arg("openai-api-key", process.env.OPENAI_API_KEY ?? "");
  const metaAppId = arg("meta-app-id", process.env.META_APP_ID ?? "");
  const metaAppSecret = arg("meta-app-secret", process.env.META_APP_SECRET ?? "");
  const metaVerifyToken = arg("meta-verify-token", process.env.META_VERIFY_TOKEN ?? "");
  const paymentWebhookSecret = arg("payment-webhook-secret", process.env.PAYMENT_WEBHOOK_SECRET ?? "");
  const billingSkipPayment = arg("billing-skip-payment", env === "prod" ? "false" : "true");
  const jwtSecret = arg("jwt-secret", process.env.JWT_SECRET ?? randomBytes(32).toString("hex"));
  const dryRun = process.argv.includes("--dry-run");

  if (!existsSync(credentialsCsv)) throw new Error(`Credentials CSV not found: ${credentialsCsv}`);
  const creds = parseCredentialsCsv(credentialsCsv);
  const awsEnv = {
    ...process.env,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
    AWS_DEFAULT_REGION: region,
    AWS_REGION: region,
  };

  console.log(`Building Lambda bundles for ${env}...`);
  sh("npm", ["run", "build:lambdas"], { cwd: ROOT, stdio: "inherit" });

  const caller = dryRun
    ? { Account: arg("account-id", "000000000000") }
    : JSON.parse(sh("aws", ["sts", "get-caller-identity"], { env: awsEnv }));
  const accountId = caller.Account;
  const artifactBucket = `commercechat-${env}-${accountId}-${region}-deploy`;
  const artifactPrefix = `serverless/${Date.now()}`;
  const artifactDir = join(OUT_DIR, "artifacts", artifactPrefix);
  const templatePath = join(OUT_DIR, `template-${env}.json`);
  const handlerFiles = readdirSync(BUILD_DIR)
    .filter((name) => name.endsWith(".cjs"))
    .map((name) => basename(name, ".cjs"))
    .filter((name) => name !== "jwt-authorizer");

  mkdirSync(OUT_DIR, { recursive: true });
  zipHandlers(handlerFiles, artifactDir);
  const template = buildTemplate({ env, region, artifactBucket, artifactPrefix, handlerFiles });
  writeFileSync(templatePath, `${JSON.stringify(template, null, 2)}\n`);

  if (dryRun) {
    console.log(`Dry run complete. Template: ${templatePath}`);
    return;
  }

  console.log(`Ensuring artifact bucket s3://${artifactBucket}...`);
  try {
    sh("aws", ["s3api", "create-bucket", "--bucket", artifactBucket, "--region", region], { env: awsEnv });
  } catch {
    // Bucket may already exist in this account/region.
  }
  sh("aws", [
    "s3api",
    "put-bucket-tagging",
    "--bucket",
    artifactBucket,
    "--tagging",
    JSON.stringify({
      TagSet: resourceTags(env, "api", "core-api", "internal").map((t) => ({ Key: t.Key, Value: t.Value })),
    }),
  ], { env: awsEnv });

  console.log("Uploading Lambda artifacts...");
  uploadArtifacts(handlerFiles, artifactDir, artifactBucket, artifactPrefix, awsEnv);

  console.log(`Deploying CloudFormation stack ${stackName}...`);
  sh("aws", [
    "cloudformation",
    "deploy",
    "--template-file",
    templatePath,
    "--s3-bucket",
    artifactBucket,
    "--s3-prefix",
    `${artifactPrefix}/templates`,
    "--stack-name",
    stackName,
    "--capabilities",
    "CAPABILITY_NAMED_IAM",
    "--region",
    region,
    "--parameter-overrides",
    `JwtSecret=${jwtSecret}`,
    `AppUrl=${appUrl}`,
    "ApiPublicUrl=",
    "AssetsPublicUrl=",
    `OpenAIApiKey=${openaiApiKey}`,
    `MetaAppId=${metaAppId}`,
    `MetaAppSecret=${metaAppSecret}`,
    `MetaVerifyToken=${metaVerifyToken}`,
    `PaymentWebhookSecret=${paymentWebhookSecret}`,
    `BillingSkipPayment=${billingSkipPayment}`,
    "--tags",
    "Project=CommerceChat",
    "Application=commercechat",
    `Environment=${env}`,
    "ManagedBy=cloudformation",
    "Owner=platform",
  ], { env: awsEnv, stdio: "inherit" });

  const outputsRaw = sh("aws", ["cloudformation", "describe-stacks", "--stack-name", stackName], { env: awsEnv });
  const stack = JSON.parse(outputsRaw).Stacks?.[0];
  const outputs = Object.fromEntries((stack?.Outputs ?? []).map((o) => [o.OutputKey, o.OutputValue]));
  const resources = stackResources(stackName, awsEnv);
  const inventoryPath = writeInventory({
    stackName,
    env,
    region,
    artifactBucket,
    artifactPrefix,
    accountId,
    apiEndpoint: outputs.ApiEndpoint,
    resources,
  });

  console.log("\nDeployment complete.");
  console.log(`API endpoint: ${outputs.ApiEndpoint}`);
  console.log(`Resource inventory: ${inventoryPath}`);
  console.log(`Remove stack: aws cloudformation delete-stack --stack-name ${stackName} --region ${region}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
