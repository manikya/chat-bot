#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const API_DIR = join(ROOT, "apps/api");
const LOCAL_API_ENV = join(API_DIR, ".env");
const LOCAL_API_ENV_AWS = join(API_DIR, ".env.aws");
const BUILD_DIR = join(API_DIR, "dist/handlers");
const OUT_DIR = join(ROOT, ".aws-deploy");
const INVENTORY_DIR = join(ROOT, "infra/deployments");

const BASE_ROUTES = [
  ["GET", "/health", "health"],
  ["GET", "/widget/v1.js", "widget-bundle"],
  ["GET", "/webhooks/meta", "webhook-meta"],
  ["POST", "/webhooks/meta", "webhook-meta"],
  ["POST", "/webhooks/payment", "webhook-payment"],
  ["GET", "/api/v1/billing/plans", "billing", "plansHandler"],
  ["GET", "/api/v1/billing/subscription", "billing", "subscriptionHandler"],
  ["GET", "/api/v1/billing/overview", "billing", "overviewHandler"],
  ["POST", "/api/v1/billing/checkout", "billing", "checkoutHandler"],
  ["POST", "/api/v1/billing/cancel", "billing", "cancelHandler"],
  ["POST", "/api/v1/billing/reactivate", "billing", "reactivateHandler"],
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
  ["PATCH", "/api/v1/conversations/{conversationId}/handling", "conversations"],
  ["POST", "/api/v1/conversations/{conversationId}/reply", "conversations"],
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
  ["GET", "/api/v1/knowledge/faq", "knowledge-faq"],
  ["POST", "/api/v1/knowledge/faq", "knowledge-faq"],
  ["GET", "/api/v1/knowledge/page-voice", "knowledge-page-voice"],
  ["PATCH", "/api/v1/knowledge/page-voice", "knowledge-page-voice"],
  ["POST", "/api/v1/knowledge/page-voice/sync", "knowledge-page-voice"],
  ["POST", "/api/v1/knowledge/page-voice/upload", "knowledge-page-voice"],
  ["GET", "/api/v1/knowledge/page-voice/export", "knowledge-page-voice"],
  ["POST", "/api/v1/knowledge/detect-platform", "knowledge-detect-platform"],
  ["GET", "/api/v1/commerce/products", "commerce-products"],
  ["GET", "/api/v1/commerce/wordpress/status", "commerce-wordpress", "statusHandler"],
  ["POST", "/api/v1/commerce/wordpress/connect", "commerce-wordpress", "connectHandler"],
  ["POST", "/api/v1/commerce/wordpress/sync", "commerce-wordpress", "syncHandler"],
  ["DELETE", "/api/v1/commerce/wordpress", "commerce-wordpress", "disconnectHandler"],
  ["GET", "/api/v1/commerce/wordpress/widget-bootstrap", "commerce-wordpress", "widgetBootstrapHandler"],
  ["GET", "/api/v1/team", "team"],
  ["DELETE", "/api/v1/team/{userId}", "team-member", "deleteHandler"],
  ["PATCH", "/api/v1/team/{userId}", "team-member", "patchHandler"],
  ["GET", "/api/v1/dashboard/stats", "dashboard-stats"],
  ["GET", "/api/v1/analytics", "analytics"],
  ["GET", "/api/v1/channels", "channels", "listHandler"],
  ["POST", "/api/v1/channels/meta/connect", "channels", "connectHandler"],
  ["POST", "/api/v1/channels/meta/connect-messenger", "channels", "connectMessengerHandler"],
  ["POST", "/api/v1/channels/meta/connect-instagram", "channels", "connectInstagramHandler"],
  ["POST", "/api/v1/channels/meta/connect-dev", "channels", "devConnectHandler"],
  ["POST", "/api/v1/channels/meta/connect-messenger-dev", "channels", "messengerDevConnectHandler"],
  ["GET", "/api/v1/channels/meta/dev-status", "channels", "devStatusHandler"],
  ["GET", "/api/v1/channels/meta/health", "channels", "healthHandler"],
  ["DELETE", "/api/v1/channels/meta/{channel}", "channels", "disconnectHandler"],
  ["POST", "/internal/cron/meta-token-refresh", "cron-meta-token-refresh"],
  ["POST", "/internal/cron/billing-lifecycle", "cron-billing-lifecycle"],
];

function getDeployRoutes(widgetCdnUrl) {
  if (!widgetCdnUrl) return BASE_ROUTES;
  return BASE_ROUTES.filter(([, path, file]) => !(path === "/widget/v1.js" && file === "widget-bundle"));
}

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasArg(name) {
  return process.argv.some((item) => item.startsWith(`--${name}=`));
}

function readDeploymentInventory(env, kind) {
  if (!existsSync(INVENTORY_DIR)) return null;
  const files = readdirSync(INVENTORY_DIR)
    .filter((name) => name.startsWith(`commercechat-${env}`) && name.endsWith(".json"))
    .filter((name) => !name.includes("partial") && !name.includes("failed") && !name.includes("error"))
    .filter((name) => (kind === "admin" ? name.includes("-admin-") : !name.includes("-admin-")))
    .sort();
  const latest = files.at(-1);
  if (!latest) return null;
  return JSON.parse(readFileSync(join(INVENTORY_DIR, latest), "utf8"));
}

function latestApiEndpoint(env) {
  const inv = readDeploymentInventory(env, "api");
  return inv?.apiEndpoint ?? null;
}

function latestAdminUrl(env) {
  const inv = readDeploymentInventory(env, "admin");
  return inv?.adminUrl ?? null;
}

function latestWidgetCdnUrl(env) {
  if (!existsSync(INVENTORY_DIR)) return null;
  const files = readdirSync(INVENTORY_DIR)
    .filter((name) => name.startsWith(`commercechat-${env}-widget-`) && name.endsWith(".json"))
    .sort();
  const latest = files.at(-1);
  if (!latest) return null;
  const inv = JSON.parse(readFileSync(join(INVENTORY_DIR, latest), "utf8"));
  return inv.widgetCdnUrl ?? null;
}

function metaOAuthRedirectForAdminUrl(adminUrl) {
  return adminUrl ? `${adminUrl.replace(/\/$/, "")}/channels/meta/callback` : "";
}

/** Load apps/api/.env (+ optional .env.aws overrides) for deploy secrets. */
function loadEnvFile(path, override = false) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
}

function loadLocalApiEnv() {
  loadEnvFile(LOCAL_API_ENV, false);
  loadEnvFile(LOCAL_API_ENV_AWS, true);
}

function readDeployedLambdaEnv(stackName, awsEnv) {
  const list = awsCall(
    [
      "lambda",
      "list-functions",
      "--query",
      `Functions[?starts_with(FunctionName, '${stackName}')].FunctionName | [0]`,
      "--output",
      "text",
    ],
    awsEnv
  );
  if (!list.ok || !list.stdout.trim()) return null;
  const config = awsCall(
    ["lambda", "get-function-configuration", "--function-name", list.stdout.trim(), "--query", "Environment.Variables", "--output", "json"],
    awsEnv
  );
  if (!config.ok) return null;
  try {
    return JSON.parse(config.stdout);
  } catch {
    return null;
  }
}

/** Stacks that must be deleted before a new deploy (failed create). UPDATE_ROLLBACK_COMPLETE is recoverable via normal update. */
const FAILED_STACK_STATUSES = new Set([
  "ROLLBACK_COMPLETE",
  "ROLLBACK_FAILED",
  "CREATE_FAILED",
  "UPDATE_ROLLBACK_FAILED",
]);

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
    const detail =
      typeof err === "object" && err && "stderr" in err && err.stderr
        ? String(err.stderr).trim().split("\n")[0]
        : "";
    throw new Error(detail ? `${cmd} failed (${status}): ${detail}` : `${cmd} failed with exit code ${status}`);
  }
}

function awsCall(args, awsEnv) {
  try {
    const stdout = execFileSync("aws", args, {
      env: awsEnv,
      encoding: "utf8",
      stdio: "pipe",
    });
    return { ok: true, stdout };
  } catch (err) {
    const stderr =
      typeof err === "object" && err && "stderr" in err ? String(err.stderr).trim() : String(err);
    return { ok: false, stderr };
  }
}

function isNotFoundError(stderr) {
  return /ResourceNotFoundException|NoSuchEntity|does not exist|Stack with id|Not Found|404/.test(stderr);
}

function isAccessDenied(stderr) {
  return /AccessDenied|not authorized|not allowed to perform/i.test(stderr);
}

function runPreflightChecks({ env, region, stackName, artifactBucket, awsEnv, withIngestStepFunctions = false }) {
  const tableName = `commercechat-${env}-storage-main`;
  const roleName = `commercechat-${env}-api-lambda-role-${region}`;
  const checks = [
    {
      permission: "cloudformation:DescribeStacks",
      run: () =>
        awsCall(
          ["cloudformation", "describe-stacks", "--stack-name", stackName, "--region", region],
          awsEnv
        ),
      allowNotFound: true,
    },
    {
      permission: "dynamodb:DescribeTable",
      run: () => awsCall(["dynamodb", "describe-table", "--table-name", tableName, "--region", region], awsEnv),
      allowNotFound: true,
    },
    {
      permission: "s3:HeadBucket",
      run: () => awsCall(["s3api", "head-bucket", "--bucket", artifactBucket], awsEnv),
      allowNotFound: true,
    },
    {
      permission: "iam:GetRole",
      run: () => awsCall(["iam", "get-role", "--role-name", roleName], awsEnv),
      allowNotFound: true,
    },
    {
      permission: "lambda:ListFunctions",
      run: () => awsCall(["lambda", "list-functions", "--max-items", "1", "--region", region], awsEnv),
    },
    {
      permission: "logs:DescribeLogGroups",
      run: () =>
        awsCall(
          [
            "logs",
            "describe-log-groups",
            "--log-group-name-prefix",
            `/aws/lambda/commercechat-${env}`,
            "--region",
            region,
            "--limit",
            "1",
          ],
          awsEnv
        ),
    },
    {
      permission: "apigateway:GET",
      run: () => awsCall(["apigatewayv2", "get-apis", "--region", region, "--max-items", "1"], awsEnv),
    },
  ];

  if (withIngestStepFunctions) {
    checks.push({
      permission: "states:ListStateMachines",
      run: () => awsCall(["stepfunctions", "list-state-machines", "--max-results", "1", "--region", region], awsEnv),
    });
  }

  const missing = [];
  for (const check of checks) {
    const result = check.run();
    if (result.ok) continue;
    if (check.allowNotFound && isNotFoundError(result.stderr)) continue;
    if (isAccessDenied(result.stderr)) {
      missing.push({ permission: check.permission, detail: result.stderr.split("\n")[0] });
      continue;
    }
    if (!check.allowNotFound) {
      missing.push({ permission: check.permission, detail: result.stderr.split("\n")[0] });
    }
  }

  if (missing.length > 0) {
    throw new Error(
      [
        "Deploy IAM preflight failed. Attach infra/aws-deploy-iam-policy.json to this IAM user, then retry.",
        ...missing.map((item) => `  - missing ${item.permission}: ${item.detail}`),
      ].join("\n")
    );
  }

  console.log("IAM preflight checks passed.");
}

function getStackStatus(stackName, region, awsEnv) {
  const result = awsCall(
    ["cloudformation", "describe-stacks", "--stack-name", stackName, "--region", region],
    awsEnv
  );
  if (!result.ok) {
    if (isNotFoundError(result.stderr)) return "NOT_FOUND";
    throw new Error(`Could not describe stack ${stackName}: ${result.stderr.split("\n")[0]}`);
  }
  const stack = JSON.parse(result.stdout).Stacks?.[0];
  return stack?.StackStatus ?? "NOT_FOUND";
}

function ensureStackDeployable(stackName, region, awsEnv, deleteFailedStack) {
  const status = getStackStatus(stackName, region, awsEnv);
  if (status === "NOT_FOUND" || !FAILED_STACK_STATUSES.has(status)) return status;

  if (!deleteFailedStack) {
    throw new Error(
      [
        `CloudFormation stack ${stackName} is ${status} and cannot be updated.`,
        "Delete it first:",
        `  aws cloudformation delete-stack --stack-name ${stackName} --region ${region}`,
        `  aws cloudformation wait stack-delete-complete --stack-name ${stackName} --region ${region}`,
        "Or rerun deploy with --delete-failed-stack",
      ].join("\n")
    );
  }

  console.log(`Deleting failed stack ${stackName} (${status})...`);
  sh(
    "aws",
    ["cloudformation", "delete-stack", "--stack-name", stackName, "--region", region],
    { env: awsEnv }
  );
  sh(
    "aws",
    ["cloudformation", "wait", "stack-delete-complete", "--stack-name", stackName, "--region", region],
    { env: awsEnv, stdio: "inherit" }
  );
  return "NOT_FOUND";
}

function getRootStackFailure(stackName, region, awsEnv) {
  const result = awsCall(
    [
      "cloudformation",
      "describe-stack-events",
      "--stack-name",
      stackName,
      "--region",
      region,
      "--max-items",
      "100",
    ],
    awsEnv
  );
  if (!result.ok) return null;

  for (const event of JSON.parse(result.stdout).StackEvents ?? []) {
    const reason = event.ResourceStatusReason ?? "";
    if (
      (event.ResourceStatus ?? "").endsWith("_FAILED") &&
      !/Resource creation cancelled/i.test(reason)
    ) {
      return {
        logicalId: event.LogicalResourceId,
        status: event.ResourceStatus,
        reason,
      };
    }
  }
  return null;
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

function addCronSchedules(resources, env, handlerFiles) {
  const schedules = [
    {
      id: "MetaTokenRefresh",
      handler: "cron-meta-token-refresh",
      cron: "cron(0 3 * * ? *)",
      description: "Refresh expiring Meta channel tokens",
    },
    {
      id: "BillingLifecycle",
      handler: "cron-billing-lifecycle",
      cron: "cron(0 6 * * ? *)",
      description: "Trial expiry, subscription end, billing emails",
    },
  ];

  for (const schedule of schedules) {
    if (!handlerFiles.includes(schedule.handler)) continue;
    const fnId = logicalId("Fn", schedule.handler);
    const ruleId = `${schedule.id}Schedule`;
    const permId = `${schedule.id}SchedulePermission`;

    resources[ruleId] = {
      Type: "AWS::Events::Rule",
      Properties: {
        Name: `commercechat-${env}-${schedule.handler}`,
        Description: schedule.description,
        ScheduleExpression: schedule.cron,
        State: "ENABLED",
        Targets: [
          {
            Arn: { "Fn::GetAtt": [fnId, "Arn"] },
            Id: "LambdaTarget",
          },
        ],
      },
    };

    resources[permId] = {
      Type: "AWS::Lambda::Permission",
      Properties: {
        Action: "lambda:InvokeFunction",
        FunctionName: { Ref: fnId },
        Principal: "events.amazonaws.com",
        SourceArn: { "Fn::GetAtt": [ruleId, "Arn"] },
      },
    };
  }
}

function buildTemplate({
  env,
  region,
  artifactBucket,
  artifactPrefix,
  handlerFiles,
  deployRoutes,
  widgetCdnUrl = "",
  withIngestPipeline = false,
  withIngestStepFunctions = false,
  withCronSchedules = true,
}) {
  const resources = {};
  const lambdaRole = "LambdaRole";
  const tableName = `commercechat-${env}-storage-main`;
  const assetsBucket = `commercechat-${env}-assets-\${AWS::AccountId}-\${AWS::Region}`;
  const dataBucket = `commercechat-${env}-data-\${AWS::AccountId}-\${AWS::Region}`;
  const vectorBucketName = `commercechat-${env}-vectors`;

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

  // S3 Vectors bucket is created by scripts/create-s3-vectors-bucket.mjs before deploy
  // (CFN AWS::S3Vectors::VectorBucket fails with 409 if the bucket already exists).

  if (withIngestPipeline) {
    resources.IngestDeadLetterQueue = {
      Type: "AWS::SQS::Queue",
      Properties: {
        QueueName: `commercechat-${env}-ingest-dlq`,
        MessageRetentionPeriod: 1209600,
        Tags: resourceTags(env, "ingest", "knowledge-ingest", "customer"),
      },
    };

    resources.IngestQueue = {
      Type: "AWS::SQS::Queue",
      Properties: {
        QueueName: `commercechat-${env}-ingest`,
        VisibilityTimeout: 900,
        RedrivePolicy: {
          deadLetterTargetArn: { "Fn::GetAtt": ["IngestDeadLetterQueue", "Arn"] },
          maxReceiveCount: 3,
        },
        Tags: resourceTags(env, "ingest", "knowledge-ingest", "customer"),
      },
    };

    if (withIngestStepFunctions) {
      resources.IngestStateMachineRole = {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: { "Fn::Sub": `commercechat-${env}-ingest-sfn-role-\${AWS::Region}` },
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "states.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        },
        Policies: [
          {
            PolicyName: "invoke-ingest-worker",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: ["lambda:InvokeFunction"],
                  Resource: {
                    "Fn::Sub": `arn:aws:lambda:\${AWS::Region}:\${AWS::AccountId}:function:commercechat-${env}-ingest-worker`,
                  },
                },
              ],
            },
          },
        ],
        Tags: resourceTags(env, "ingest", "knowledge-ingest", "internal"),
      },
    };
    }
  }

  const ingestPolicyStatements = withIngestPipeline
    ? [
        {
          Effect: "Allow",
          Action: [
            "sqs:ReceiveMessage",
            "sqs:DeleteMessage",
            "sqs:GetQueueAttributes",
            "sqs:SendMessage",
          ],
          Resource: [
            { "Fn::GetAtt": ["IngestQueue", "Arn"] },
            { "Fn::GetAtt": ["IngestDeadLetterQueue", "Arn"] },
          ],
        },
        ...(withIngestStepFunctions
          ? [
              {
                Effect: "Allow",
                Action: ["states:StartExecution"],
                Resource: {
                  "Fn::Sub": `arn:aws:states:\${AWS::Region}:\${AWS::AccountId}:stateMachine:commercechat-${env}-ingest`,
                },
              },
            ]
          : []),
      ]
    : [];

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
                  "s3vectors:CreateIndex",
                  "s3vectors:GetIndex",
                  "s3vectors:ListIndexes",
                  "s3vectors:PutVectors",
                  "s3vectors:QueryVectors",
                  "s3vectors:GetVectors",
                  "s3vectors:DeleteVectors",
                  "s3vectors:ListVectors",
                ],
                Resource: [
                  { "Fn::Sub": `arn:aws:s3vectors:\${AWS::Region}:\${AWS::AccountId}:bucket/${vectorBucketName}` },
                  {
                    "Fn::Sub": `arn:aws:s3vectors:\${AWS::Region}:\${AWS::AccountId}:bucket/${vectorBucketName}/index/*`,
                  },
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
                  "secretsmanager:DeleteSecret",
                ],
                Resource: { "Fn::Sub": "arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:commercechat/*" },
              },
              ...ingestPolicyStatements,
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
  for (const [, , file, exportName = "handler"] of deployRoutes) {
    functionDefs.set(`${file}:${exportName}`, { file, exportName });
  }
  functionDefs.set("ingest-worker:handler", { file: "ingest-worker", exportName: "handler" });
  if (!withIngestPipeline) {
    functionDefs.delete("ingest-worker:handler");
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
      handlerName.includes("knowledge") ||
      handlerName === "chat-api" ||
      handlerName === "widget" ||
      handlerName === "ingest-worker"
        ? 60
        : 20;
    const memory =
      handlerName.includes("knowledge") ||
      handlerName === "chat-api" ||
      handlerName === "widget" ||
      handlerName === "ingest-worker"
        ? 1024
        : 512;

    resources[logId] = {
      Type: "AWS::Logs::LogGroup",
      Properties: {
        LogGroupName: { "Fn::Sub": `/aws/lambda/commercechat-${env}-${suffix}` },
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
            WIDGET_CDN_URL: { Ref: "WidgetCdnUrl" },
            AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
            AWS_REGION_NAME: region,
            S3_BUCKET: { Ref: "AssetsBucket" },
            S3_ASSETS_BUCKET: { Ref: "AssetsBucket" },
            S3_DATA_BUCKET: { Ref: "DataBucket" },
            S3_PUBLIC_URL: { Ref: "AssetsPublicUrl" },
            OPENAI_API_KEY: { Ref: "OpenAIApiKey" },
            META_APP_ID: { Ref: "MetaAppId" },
            META_APP_SECRET: { Ref: "MetaAppSecret" },
            META_VERIFY_TOKEN: { Ref: "MetaVerifyToken" },
            META_OAUTH_REDIRECT_URI: { Ref: "MetaOAuthRedirectUri" },
            SMTP_HOST: { Ref: "SmtpHost" },
            SMTP_PORT: { Ref: "SmtpPort" },
            SMTP_USER: { Ref: "SmtpUser" },
            SMTP_PASS: { Ref: "SmtpPass" },
            SMTP_FROM: { Ref: "SmtpFrom" },
            META_SECRETS_BACKEND: "dynamodb",
            PAYMENT_WEBHOOK_SECRET: { Ref: "PaymentWebhookSecret" },
            BILLING_SKIP_PAYMENT: { Ref: "BillingSkipPayment" },
            SKIP_EMAIL_VERIFICATION: { Ref: "SkipEmailVerification" },
            META_TOKEN_REFRESH_CRON_SECRET: { Ref: "MetaTokenRefreshCronSecret" },
            BILLING_LIFECYCLE_CRON_SECRET: { Ref: "BillingLifecycleCronSecret" },
            S3_VECTORS_BUCKET: vectorBucketName,
            DATA_DIR: "/tmp/commercechat",
            ...(handlerName !== "ingest-worker" && withIngestPipeline
              ? {
                  INGEST_QUEUE_URL: { Ref: "IngestQueue" },
                  ...(withIngestStepFunctions
                    ? { INGEST_STATE_MACHINE_ARN: { Ref: "IngestStateMachine" } }
                    : {}),
                }
              : {}),
          },
        },
        Tags: resourceTags(env, cls.component, cls.costGroup, cls.dataClass),
      },
    };
  }

  const ingestWorkerFnId = logicalId("Fn", "ingest-worker");

  if (withIngestPipeline && withIngestStepFunctions) {
    resources.IngestStateMachine = {
      Type: "AWS::StepFunctions::StateMachine",
      DependsOn: [ingestWorkerFnId],
      Properties: {
        StateMachineName: `commercechat-${env}-ingest`,
        RoleArn: { "Fn::GetAtt": ["IngestStateMachineRole", "Arn"] },
        DefinitionString: {
          "Fn::Sub": [
            JSON.stringify({
              Comment: "CommerceChat knowledge ingest",
              StartAt: "RunIngestJob",
              States: {
                RunIngestJob: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  OutputPath: "$.Payload",
                  Parameters: {
                    FunctionName: "${IngestWorkerArn}",
                    Payload: {
                      "kind.$": "$.kind",
                      "tenantId.$": "$.tenantId",
                      "jobId.$": "$.jobId",
                    },
                  },
                  Retry: [
                    {
                      ErrorEquals: ["States.ALL"],
                      IntervalSeconds: 5,
                      MaxAttempts: 2,
                      BackoffRate: 2,
                    },
                  ],
                  End: true,
                },
              },
            }),
            { IngestWorkerArn: { "Fn::GetAtt": [ingestWorkerFnId, "Arn"] } },
          ],
        },
        Tags: resourceTags(env, "ingest", "knowledge-ingest", "internal"),
      },
    };
  }

  if (withIngestPipeline && handlerFiles.includes("ingest-worker")) {
    resources.IngestWorkerEventSourceMapping = {
      Type: "AWS::Lambda::EventSourceMapping",
      DependsOn: [ingestWorkerFnId],
      Properties: {
        BatchSize: 1,
        Enabled: true,
        EventSourceArn: { "Fn::GetAtt": ["IngestQueue", "Arn"] },
        FunctionName: { Ref: ingestWorkerFnId },
      },
    };
  }

  const routeIndex = new Map();
  for (const [method, path, file, exportName = "handler"] of deployRoutes) {
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

  if (withCronSchedules) {
    addCronSchedules(resources, env, handlerFiles);
  }

  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `CommerceChat ${env} serverless API stack`,
    Parameters: {
      JwtSecret: { Type: "String", NoEcho: true, MinLength: 16 },
      AppUrl: { Type: "String", Default: "http://localhost:3000" },
      ApiPublicUrl: { Type: "String", Default: "" },
      WidgetCdnUrl: { Type: "String", Default: "" },
      AssetsPublicUrl: { Type: "String", Default: "" },
      OpenAIApiKey: { Type: "String", NoEcho: true, Default: "" },
      MetaAppId: { Type: "String", Default: "" },
      MetaAppSecret: { Type: "String", NoEcho: true, Default: "" },
      MetaVerifyToken: { Type: "String", NoEcho: true, Default: "" },
      MetaOAuthRedirectUri: { Type: "String", Default: "" },
      SmtpHost: { Type: "String", Default: "" },
      SmtpPort: { Type: "String", Default: "587" },
      SmtpUser: { Type: "String", Default: "" },
      SmtpPass: { Type: "String", NoEcho: true, Default: "" },
      SmtpFrom: { Type: "String", Default: "" },
      PaymentWebhookSecret: { Type: "String", NoEcho: true, Default: "" },
      BillingSkipPayment: { Type: "String", AllowedValues: ["true", "false"], Default: env === "prod" ? "false" : "true" },
      SkipEmailVerification: { Type: "String", AllowedValues: ["true", "false"], Default: env === "prod" ? "false" : "true" },
      MetaTokenRefreshCronSecret: { Type: "String", NoEcho: true, Default: "" },
      BillingLifecycleCronSecret: { Type: "String", NoEcho: true, Default: "" },
    },
    Resources: resources,
    Outputs: {
      ApiEndpoint: { Value: { "Fn::GetAtt": ["HttpApi", "ApiEndpoint"] } },
      WidgetCdnUrl: { Value: { Ref: "WidgetCdnUrl" } },
      TableName: { Value: { Ref: "MainTable" } },
      AssetsBucketName: { Value: { Ref: "AssetsBucket" } },
      DataBucketName: { Value: { Ref: "DataBucket" } },
      S3VectorsBucketName: { Value: vectorBucketName },
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
    status: "success",
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
    removal: removalCommands({ stackName, region, artifactBucket, artifactPrefix }),
  };
  writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  return inventoryPath;
}

function removalCommands({ stackName, region, artifactBucket, artifactPrefix }) {
  return {
    deleteStack: `aws cloudformation delete-stack --stack-name ${stackName} --region ${region}`,
    waitForDelete: `aws cloudformation wait stack-delete-complete --stack-name ${stackName} --region ${region}`,
    emptyArtifacts: `aws s3 rm s3://${artifactBucket}/${artifactPrefix} --recursive --region ${region}`,
    deleteArtifactBucket: `aws s3 rb s3://${artifactBucket} --force --region ${region}`,
  };
}

function writeFailureInventory({
  stackName,
  env,
  region,
  accountId,
  artifactBucket,
  artifactPrefix,
  status,
  reason,
  stackStatus,
  rootFailure,
  artifactUploaded = false,
}) {
  mkdirSync(INVENTORY_DIR, { recursive: true });
  const suffix =
    status === "partial-failed-before-cloudformation"
      ? "partial"
      : status === "failed-rollback-complete"
        ? "failed"
        : "error";
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const inventoryPath = join(INVENTORY_DIR, `${stackName}-${suffix}-${now}.json`);
  const inventory = {
    createdAt: new Date().toISOString(),
    status,
    reason,
    accountId,
    region,
    stackName,
    stackStatus: stackStatus ?? null,
    rootFailure: rootFailure ?? null,
    artifactBucket: artifactBucket ?? null,
    artifactPrefix: artifactPrefix ?? null,
    artifactUploaded,
    resources: artifactBucket
      ? [
          {
            type: "AWS::S3::Bucket",
            physicalId: artifactBucket,
            purpose: "Lambda/template deployment artifacts",
          },
        ]
      : [],
    removal: artifactBucket
      ? removalCommands({ stackName, region, artifactBucket, artifactPrefix: artifactPrefix ?? "serverless/" })
      : null,
    requiredNextPermission:
      /preflight failed|not authorized|AccessDenied/i.test(reason)
        ? "Attach infra/aws-deploy-iam-policy.json to the deploy IAM user"
        : FAILED_STACK_STATUSES.has(stackStatus ?? "")
          ? `Delete stack ${stackName} or rerun with --delete-failed-stack`
          : null,
  };
  writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  return inventoryPath;
}

async function main() {
  const credentialsCsv = arg("credentials-csv", "/Users/manikya/Downloads/manikya_accessKeys (1).csv");
  const env = arg("env", "dev");
  const region = arg("region", "us-east-1");
  const stackName = arg("stack", `commercechat-${env}`);
  const dryRun = process.argv.includes("--dry-run");
  const preflightOnly = process.argv.includes("--preflight-only");
  const deleteFailedStack = process.argv.includes("--delete-failed-stack");
  const withIngestPipeline = process.argv.includes("--with-ingest-pipeline");
  const withIngestStepFunctions = process.argv.includes("--with-ingest-step-functions");
  const withCronSchedules = !process.argv.includes("--no-cron-schedules");
  const ensureIam = process.argv.includes("--ensure-iam");
  const withWidgetCdn = process.argv.includes("--with-widget-cdn");

  if (!existsSync(credentialsCsv)) throw new Error(`Credentials CSV not found: ${credentialsCsv}`);
  loadLocalApiEnv();
  const creds = parseCredentialsCsv(credentialsCsv);
  const awsEnv = {
    ...process.env,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
    AWS_DEFAULT_REGION: region,
    AWS_REGION: region,
  };

  const caller = dryRun
    ? { Account: arg("account-id", "000000000000") }
    : JSON.parse(sh("aws", ["sts", "get-caller-identity"], { env: awsEnv }));
  const accountId = caller.Account;
  const deployedEnv = readDeployedLambdaEnv(stackName, awsEnv);
  const appUrl = arg("app-url", latestAdminUrl(env) ?? deployedEnv?.APP_URL ?? "http://localhost:3000");
  const apiPublicUrl = arg("api-public-url", latestApiEndpoint(env) ?? deployedEnv?.API_PUBLIC_URL ?? "");
  const openaiApiKey = hasArg("openai-api-key")
    ? arg("openai-api-key", "")
    : process.env.OPENAI_API_KEY ?? deployedEnv?.OPENAI_API_KEY ?? "";
  const metaAppId = hasArg("meta-app-id")
    ? arg("meta-app-id", "")
    : process.env.META_APP_ID ?? deployedEnv?.META_APP_ID ?? "";
  const metaAppSecret = hasArg("meta-app-secret")
    ? arg("meta-app-secret", "")
    : process.env.META_APP_SECRET ?? deployedEnv?.META_APP_SECRET ?? "";
  const metaVerifyToken = hasArg("meta-verify-token")
    ? arg("meta-verify-token", "")
    : process.env.META_VERIFY_TOKEN ?? deployedEnv?.META_VERIFY_TOKEN ?? "";
  const paymentWebhookSecret = hasArg("payment-webhook-secret")
    ? arg("payment-webhook-secret", "")
    : process.env.PAYMENT_WEBHOOK_SECRET ?? deployedEnv?.PAYMENT_WEBHOOK_SECRET ?? "";
  const billingSkipPayment = arg("billing-skip-payment", env === "prod" ? "false" : "true");
  const skipEmailVerification = arg(
    "skip-email-verification",
    process.env.SKIP_EMAIL_VERIFICATION === "false" ? "false" : env === "prod" ? "false" : "true"
  );
  const jwtSecret = hasArg("jwt-secret")
    ? arg("jwt-secret", "")
    : process.env.JWT_SECRET ?? deployedEnv?.JWT_SECRET ?? randomBytes(32).toString("hex");
  const metaOAuthRedirectUri = arg(
    "meta-oauth-redirect-uri",
    metaOAuthRedirectForAdminUrl(appUrl) || deployedEnv?.META_OAUTH_REDIRECT_URI || ""
  );
  const smtpHost = hasArg("smtp-host")
    ? arg("smtp-host", "")
    : process.env.SMTP_HOST ?? deployedEnv?.SMTP_HOST ?? "";
  const smtpPort = hasArg("smtp-port")
    ? arg("smtp-port", "587")
    : process.env.SMTP_PORT ?? deployedEnv?.SMTP_PORT ?? "587";
  const smtpUser = hasArg("smtp-user")
    ? arg("smtp-user", "")
    : process.env.SMTP_USER ?? deployedEnv?.SMTP_USER ?? "";
  const smtpPass = hasArg("smtp-pass")
    ? arg("smtp-pass", "")
    : process.env.SMTP_PASS ?? deployedEnv?.SMTP_PASS ?? "";
  const smtpFrom = hasArg("smtp-from")
    ? arg("smtp-from", "")
    : process.env.SMTP_FROM ?? deployedEnv?.SMTP_FROM ?? smtpUser;
  const metaTokenRefreshCronSecret = hasArg("meta-token-refresh-cron-secret")
    ? arg("meta-token-refresh-cron-secret", "")
    : process.env.META_TOKEN_REFRESH_CRON_SECRET ?? deployedEnv?.META_TOKEN_REFRESH_CRON_SECRET ?? randomBytes(32).toString("hex");
  const billingLifecycleCronSecret = hasArg("billing-lifecycle-cron-secret")
    ? arg("billing-lifecycle-cron-secret", "")
    : process.env.BILLING_LIFECYCLE_CRON_SECRET ?? deployedEnv?.BILLING_LIFECYCLE_CRON_SECRET ?? randomBytes(32).toString("hex");
  let widgetCdnUrl = hasArg("widget-cdn-url")
    ? arg("widget-cdn-url", "")
    : latestWidgetCdnUrl(env) ?? deployedEnv?.WIDGET_CDN_URL ?? "";
  const artifactBucket = `commercechat-${env}-${accountId}-${region}-deploy`;
  let artifactPrefix = null;
  let artifactUploaded = false;

  const fail = (status, reason, extra = {}) => {
    const stackStatus = extra.stackStatus ?? getStackStatus(stackName, region, awsEnv);
    const rootFailure =
      extra.rootFailure ??
      (stackStatus !== "NOT_FOUND" ? getRootStackFailure(stackName, region, awsEnv) : null);
    const inventoryPath = writeFailureInventory({
      stackName,
      env,
      region,
      accountId,
      artifactBucket,
      artifactPrefix,
      status,
      reason,
      stackStatus: stackStatus === "NOT_FOUND" ? null : stackStatus,
      rootFailure,
      artifactUploaded,
    });
    const error = new Error(`${reason}\nFailure inventory: ${inventoryPath}`);
    throw error;
  };

  try {
    console.log(`Account ${accountId} | stack ${stackName} | region ${region}`);
    console.log(`AppUrl ${appUrl} | ApiPublicUrl ${apiPublicUrl || "(empty)"}`);
    console.log(`Skip email verification: ${skipEmailVerification}`);
    if (metaOAuthRedirectUri) console.log(`Meta OAuth redirect ${metaOAuthRedirectUri}`);
    if (smtpHost && smtpUser && smtpPass) {
      console.log(`SMTP ${smtpHost}:${smtpPort} as ${smtpUser}`);
    } else {
      console.log("SMTP not configured — auth emails log to CloudWatch only");
    }
    if (ensureIam) {
      console.log("Ensuring deploy IAM policy is attached...");
      sh("node", ["scripts/ensure-deploy-iam.mjs", `--credentials-csv=${credentialsCsv}`, `--region=${region}`], {
        cwd: ROOT,
        stdio: "inherit",
      });
    }
    if (widgetCdnUrl) {
      console.log(`Widget CDN ${widgetCdnUrl} — API Gateway /widget/v1.js route omitted`);
    }
    runPreflightChecks({ env, region, stackName, artifactBucket, awsEnv, withIngestStepFunctions });

    if (preflightOnly) {
      const stackStatus = getStackStatus(stackName, region, awsEnv);
      if (FAILED_STACK_STATUSES.has(stackStatus)) {
        console.log(`Warning: stack ${stackName} is ${stackStatus}. Use --delete-failed-stack on deploy.`);
      }
      console.log("Preflight checks passed.");
      return;
    }

    if (withWidgetCdn) {
      console.log("Deploying widget CDN (S3 + CloudFront)...");
      sh(
        "node",
        ["scripts/deploy-widget-static.mjs", `--credentials-csv=${credentialsCsv}`, `--env=${env}`, `--region=${region}`],
        { cwd: ROOT, stdio: "inherit" }
      );
      widgetCdnUrl = latestWidgetCdnUrl(env) ?? widgetCdnUrl;
      if (widgetCdnUrl) {
        console.log(`Widget CDN ${widgetCdnUrl} — API Gateway /widget/v1.js route omitted`);
      }
    }

    const stackStatus = ensureStackDeployable(stackName, region, awsEnv, deleteFailedStack);
    if (stackStatus !== "NOT_FOUND") {
      console.log(`Existing stack status: ${stackStatus}`);
    }

    console.log(`Building Lambda bundles for ${env}...`);
    sh("npm", ["run", "build:lambdas"], { cwd: ROOT, stdio: "inherit" });

    const vectorBucketName = `commercechat-${env}-vectors`;
    if (!withIngestPipeline) {
      console.log("Ingest SQS skipped (pass --with-ingest-pipeline).");
    } else if (!withIngestStepFunctions) {
      console.log("Ingest Step Functions skipped (pass --with-ingest-step-functions when States IAM is attached).");
    }
    if (!withCronSchedules) {
      console.log("EventBridge cron schedules skipped (pass default or omit --no-cron-schedules).");
    } else {
      console.log("EventBridge cron schedules enabled (meta token 03:00 UTC, billing lifecycle 06:00 UTC).");
    }
    console.log(`Ensuring S3 Vectors bucket ${vectorBucketName}...`);
    try {
      sh("node", ["scripts/create-s3-vectors-bucket.mjs", `--env=${env}`, `--region=${region}`], {
        cwd: ROOT,
        stdio: "inherit",
        env: awsEnv,
      });
    } catch {
      console.warn(
        `Vector bucket pre-create skipped — CloudFormation will create ${vectorBucketName} when IAM allows AWS::S3Vectors::VectorBucket.`
      );
    }

    artifactPrefix = `serverless/${Date.now()}`;
    const artifactDir = join(OUT_DIR, "artifacts", artifactPrefix);
    const templatePath = join(OUT_DIR, `template-${env}.json`);
    const handlerFiles = readdirSync(BUILD_DIR)
      .filter((name) => name.endsWith(".cjs"))
      .map((name) => basename(name, ".cjs"))
      .filter((name) => name !== "jwt-authorizer");

    mkdirSync(OUT_DIR, { recursive: true });
    zipHandlers(handlerFiles, artifactDir);
    const deployRoutes = getDeployRoutes(widgetCdnUrl);
    const template = buildTemplate({
      env,
      region,
      artifactBucket,
      artifactPrefix,
      handlerFiles,
      deployRoutes,
      widgetCdnUrl,
      withIngestPipeline,
      withIngestStepFunctions,
      withCronSchedules,
    });
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
    artifactUploaded = true;

    console.log(`Deploying CloudFormation stack ${stackName}...`);
    try {
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
        `ApiPublicUrl=${apiPublicUrl}`,
        `WidgetCdnUrl=${widgetCdnUrl}`,
        "AssetsPublicUrl=",
        `OpenAIApiKey=${openaiApiKey}`,
        `MetaAppId=${metaAppId}`,
        `MetaAppSecret=${metaAppSecret}`,
        `MetaVerifyToken=${metaVerifyToken}`,
        `MetaOAuthRedirectUri=${metaOAuthRedirectUri}`,
        `SmtpHost=${smtpHost}`,
        `SmtpPort=${smtpPort}`,
        `SmtpUser=${smtpUser}`,
        `SmtpPass=${smtpPass}`,
        `SmtpFrom=${smtpFrom}`,
        `PaymentWebhookSecret=${paymentWebhookSecret}`,
        `BillingSkipPayment=${billingSkipPayment}`,
        `SkipEmailVerification=${skipEmailVerification}`,
        `MetaTokenRefreshCronSecret=${metaTokenRefreshCronSecret}`,
        `BillingLifecycleCronSecret=${billingLifecycleCronSecret}`,
        "--tags",
        "Project=CommerceChat",
        "Application=commercechat",
        `Environment=${env}`,
        "ManagedBy=cloudformation",
        "Owner=platform",
      ], { env: awsEnv, stdio: "inherit" });
    } catch (deployErr) {
      const stackStatusAfter = getStackStatus(stackName, region, awsEnv);
      const rootFailure = getRootStackFailure(stackName, region, awsEnv);
      const reason =
        rootFailure?.reason ??
        (deployErr instanceof Error ? deployErr.message : String(deployErr));
      fail(
        FAILED_STACK_STATUSES.has(stackStatusAfter) ? "failed-rollback-complete" : "deploy-failed",
        reason,
        { stackStatus: stackStatusAfter, rootFailure }
      );
    }

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
    if (outputs.WidgetCdnUrl) {
      console.log(`Widget CDN: ${outputs.WidgetCdnUrl}/widget/v1.js`);
    }
    console.log(`Meta webhook URL: ${outputs.ApiEndpoint}/webhooks/meta`);
    console.log(`Resource inventory: ${inventoryPath}`);
    console.log(`Remove stack: aws cloudformation delete-stack --stack-name ${stackName} --region ${region}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("Failure inventory:")) {
      const stackStatus = getStackStatus(stackName, region, awsEnv);
      fail(
        artifactUploaded ? "deploy-failed" : "partial-failed-before-cloudformation",
        message,
        { stackStatus: stackStatus === "NOT_FOUND" ? null : stackStatus }
      );
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
