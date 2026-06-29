#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const ADMIN_DIR = join(ROOT, "apps/admin");
const OUT_DIR = join(ADMIN_DIR, "out");
const INVENTORY_DIR = join(ROOT, "infra/deployments");

const ROUTING_FUNCTION_CODE = `function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.indexOf("/conversations/") === 0 && uri.indexOf("/conversations/_/") !== 0) {
    request.uri = "/conversations/_/index.html";
    return request;
  }
  if (uri.indexOf("/platform/tenants/") === 0 && uri.indexOf("/platform/tenants/_/") !== 0) {
    request.uri = "/platform/tenants/_/index.html";
    return request;
  }
  if (uri.endsWith("/")) {
    request.uri = uri + "index.html";
  } else if (uri.indexOf(".") === -1) {
    request.uri = uri + "/index.html";
  }
  return request;
}`;

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
    const detail =
      typeof err === "object" && err && "stderr" in err && err.stderr
        ? String(err.stderr).trim().split("\n")[0]
        : "";
    throw new Error(detail ? `${cmd} failed (${status}): ${detail}` : `${cmd} failed with exit code ${status}`);
  }
}

function awsCall(args, awsEnv) {
  try {
    return { ok: true, stdout: execFileSync("aws", args, { env: awsEnv, encoding: "utf8" }) };
  } catch (err) {
    const stderr = typeof err === "object" && err && "stderr" in err ? String(err.stderr).trim() : String(err);
    return { ok: false, stderr };
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

function resourceTags(env) {
  return [
    { Key: "Project", Value: "CommerceChat" },
    { Key: "Application", Value: "commercechat" },
    { Key: "Environment", Value: env },
    { Key: "ManagedBy", Value: "cloudformation" },
    { Key: "Owner", Value: "platform" },
    { Key: "Component", Value: "admin" },
    { Key: "CostGroup", Value: "admin-web" },
    { Key: "DataClass", Value: "public" },
  ];
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
  return inv?.apiEndpoint ?? inv?.apiUrl ?? null;
}

function latestAdminUrl(env) {
  const inv = readDeploymentInventory(env, "admin");
  return inv?.adminUrl ?? null;
}

function metaOAuthRedirectForAdminUrl(adminUrl) {
  return adminUrl ? `${adminUrl.replace(/\/$/, "")}/channels/meta/callback` : "";
}

function buildTemplate(env) {
  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `CommerceChat ${env} admin static site (S3 + CloudFront)`,
    Parameters: {
      Environment: { Type: "String", Default: env },
    },
    Resources: {
      AdminBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: { "Fn::Sub": `commercechat-\${Environment}-admin-\${AWS::AccountId}-\${AWS::Region}` },
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
          },
          Tags: resourceTags(env),
        },
      },
      AdminOriginAccessControl: {
        Type: "AWS::CloudFront::OriginAccessControl",
        Properties: {
          OriginAccessControlConfig: {
            Name: { "Fn::Sub": `commercechat-\${Environment}-admin-oac` },
            OriginAccessControlOriginType: "s3",
            SigningBehavior: "always",
            SigningProtocol: "sigv4",
          },
        },
      },
      AdminRoutingFunction: {
        Type: "AWS::CloudFront::Function",
        Properties: {
          Name: { "Fn::Sub": `commercechat-\${Environment}-admin-routes` },
          AutoPublish: true,
          FunctionCode: ROUTING_FUNCTION_CODE,
          FunctionConfig: {
            Comment: "Rewrite static export paths for Next.js admin",
            Runtime: "cloudfront-js-2.0",
          },
        },
      },
      AdminDistribution: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: {
            Enabled: true,
            Comment: { "Fn::Sub": `CommerceChat \${Environment} admin` },
            DefaultRootObject: "index.html",
            HttpVersion: "http2and3",
            Origins: [
              {
                Id: "AdminS3",
                DomainName: { "Fn::GetAtt": ["AdminBucket", "RegionalDomainName"] },
                OriginAccessControlId: { "Fn::GetAtt": ["AdminOriginAccessControl", "Id"] },
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
            DefaultCacheBehavior: {
              TargetOriginId: "AdminS3",
              ViewerProtocolPolicy: "redirect-to-https",
              AllowedMethods: ["GET", "HEAD", "OPTIONS"],
              CachedMethods: ["GET", "HEAD"],
              Compress: true,
              ForwardedValues: {
                QueryString: false,
                Cookies: { Forward: "none" },
              },
              FunctionAssociations: [
                {
                  EventType: "viewer-request",
                  FunctionARN: { "Fn::GetAtt": ["AdminRoutingFunction", "FunctionARN"] },
                },
              ],
            },
            CustomErrorResponses: [
              { ErrorCode: 403, ResponseCode: 200, ResponsePagePath: "/index.html", ErrorCachingMinTTL: 0 },
              { ErrorCode: 404, ResponseCode: 200, ResponsePagePath: "/index.html", ErrorCachingMinTTL: 0 },
            ],
          },
          Tags: resourceTags(env),
        },
      },
      AdminBucketPolicy: {
        Type: "AWS::S3::BucketPolicy",
        Properties: {
          Bucket: { Ref: "AdminBucket" },
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "AllowCloudFrontRead",
                Effect: "Allow",
                Principal: { Service: "cloudfront.amazonaws.com" },
                Action: "s3:GetObject",
                Resource: { "Fn::Sub": "${AdminBucket.Arn}/*" },
                Condition: {
                  StringEquals: {
                    "AWS:SourceArn": {
                      "Fn::Sub":
                        "arn:aws:cloudfront::${AWS::AccountId}:distribution/${AdminDistribution}",
                    },
                  },
                },
              },
            ],
          },
        },
      },
    },
    Outputs: {
      AdminUrl: {
        Value: { "Fn::Join": ["", ["https://", { "Fn::GetAtt": ["AdminDistribution", "DomainName"] }]] },
      },
      AdminBucketName: { Value: { Ref: "AdminBucket" } },
      DistributionId: { Value: { Ref: "AdminDistribution" } },
    },
  };
}

function runPreflight(awsEnv, region) {
  const checks = [
    ["s3:ListBucket", ["s3api", "list-buckets", "--max-items", "1"]],
    ["cloudfront:ListDistributions", ["cloudfront", "list-distributions", "--max-items", "1"]],
    ["cloudformation:DescribeStacks", ["cloudformation", "describe-stacks", "--region", region, "--max-items", "1"]],
  ];
  const missing = [];
  for (const [permission, args] of checks) {
    const result = awsCall(args, awsEnv);
    if (!result.ok && /AccessDenied|not authorized/i.test(result.stderr)) {
      missing.push(permission);
    }
  }
  if (missing.length) {
    throw new Error(
      `Admin deploy IAM preflight failed. Update CommerceChatDeploy policy (infra/aws-deploy-iam-policy.json) and retry.\nMissing: ${missing.join(", ")}`
    );
  }
  console.log("IAM preflight checks passed.");
}

async function main() {
  const credentialsCsv = arg("credentials-csv", "/Users/manikya/Downloads/manikya_accessKeys (1).csv");
  const env = arg("env", "dev");
  const region = arg("region", "us-east-1");
  const stackName = arg("stack", `commercechat-${env}-admin`);
  const apiUrl = arg("api-url", latestApiEndpoint(env) ?? "");
  const adminUrlHint = arg("admin-url", latestAdminUrl(env) ?? "");
  const metaAppId = arg("meta-app-id", process.env.META_APP_ID ?? process.env.NEXT_PUBLIC_META_APP_ID ?? "");
  const metaOauthRedirect = arg(
    "meta-oauth-redirect-uri",
    metaOAuthRedirectForAdminUrl(adminUrlHint)
  );
  const platformAdminEmails = arg(
    "platform-admin-emails",
    process.env.PLATFORM_ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS ?? ""
  );

  if (!existsSync(credentialsCsv)) throw new Error(`Credentials CSV not found: ${credentialsCsv}`);
  if (!apiUrl) throw new Error("Pass --api-url= or deploy the API stack first (npm run deploy:aws)");

  const creds = parseCredentialsCsv(credentialsCsv);
  const awsEnv = {
    ...process.env,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
    AWS_DEFAULT_REGION: region,
    AWS_REGION: region,
  };

  const caller = JSON.parse(sh("aws", ["sts", "get-caller-identity"], { env: awsEnv }));
  console.log(`Account ${caller.Account} | admin stack ${stackName} | API ${apiUrl}`);
  runPreflight(awsEnv, region);

  const buildEnv = {
    ...process.env,
    NEXT_STATIC_EXPORT: "1",
    NEXT_PUBLIC_API_URL: apiUrl,
    ...(metaAppId ? { NEXT_PUBLIC_META_APP_ID: metaAppId } : {}),
    ...(metaOauthRedirect ? { NEXT_PUBLIC_META_OAUTH_REDIRECT_URI: metaOauthRedirect } : {}),
    ...(platformAdminEmails ? { NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS: platformAdminEmails } : {}),
  };

  console.log("Building static admin export...");
  sh("npm", ["run", "build:static", "--workspace=@commercechat/admin"], {
    cwd: ROOT,
    env: buildEnv,
    stdio: "inherit",
  });

  if (!existsSync(OUT_DIR)) {
    throw new Error(`Static export output not found at ${OUT_DIR}`);
  }

  const templatePath = join(ROOT, ".aws-deploy", `admin-template-${env}.json`);
  mkdirSync(join(ROOT, ".aws-deploy"), { recursive: true });
  writeFileSync(templatePath, `${JSON.stringify(buildTemplate(env), null, 2)}\n`);

  const stackStatusResult = awsCall(
    ["cloudformation", "describe-stacks", "--stack-name", stackName, "--region", region],
    awsEnv
  );
  if (stackStatusResult.ok) {
    const status = JSON.parse(stackStatusResult.stdout).Stacks?.[0]?.StackStatus;
    if (status === "ROLLBACK_COMPLETE" || status === "ROLLBACK_FAILED") {
      console.log(`Deleting failed stack ${stackName} (${status})...`);
      awsCall(["cloudformation", "delete-stack", "--stack-name", stackName, "--region", region], awsEnv);
      sh(
        "aws",
        ["cloudformation", "wait", "stack-delete-complete", "--stack-name", stackName, "--region", region],
        { env: awsEnv, stdio: "inherit" }
      );
    }
  }

  console.log(`Deploying CloudFormation stack ${stackName}...`);
  sh(
    "aws",
    [
      "cloudformation",
      "deploy",
      "--template-file",
      templatePath,
      "--stack-name",
      stackName,
      "--region",
      region,
      "--parameter-overrides",
      `Environment=${env}`,
      "--tags",
      "Project=CommerceChat",
      "Application=commercechat",
      `Environment=${env}`,
      "ManagedBy=cloudformation",
      "Owner=platform",
      "Component=admin",
      "CostGroup=admin-web",
    ],
    { env: awsEnv, stdio: "inherit" }
  );

  const stack = JSON.parse(
    sh("aws", ["cloudformation", "describe-stacks", "--stack-name", stackName, "--region", region], { env: awsEnv })
  ).Stacks?.[0];
  const outputs = Object.fromEntries((stack?.Outputs ?? []).map((o) => [o.OutputKey, o.OutputValue]));
  const bucket = outputs.AdminBucketName;
  const distributionId = outputs.DistributionId;
  const adminUrl = outputs.AdminUrl;

  console.log(`Syncing static files to s3://${bucket}...`);
  sh("aws", ["s3", "sync", OUT_DIR, `s3://${bucket}/`, "--delete", "--region", region], {
    env: awsEnv,
    stdio: "inherit",
  });

  console.log("Invalidating CloudFront cache...");
  sh(
    "aws",
    ["cloudfront", "create-invalidation", "--distribution-id", distributionId, "--paths", "/*"],
    { env: awsEnv, stdio: "inherit" }
  );

  const effectiveMetaRedirect = metaOauthRedirect || metaOAuthRedirectForAdminUrl(adminUrl ?? "");
  if (effectiveMetaRedirect) {
    console.log(`Meta OAuth redirect URI (whitelist in Meta app): ${effectiveMetaRedirect}`);
  }

  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const inventoryPath = join(INVENTORY_DIR, `${stackName}-${now}.json`);
  writeFileSync(
    inventoryPath,
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        status: "success",
        stackName,
        environment: env,
        region,
        accountId: caller.Account,
        adminUrl,
        apiUrl,
        bucket,
        distributionId,
        metaOAuthRedirectUri: effectiveMetaRedirect || null,
      },
      null,
      2
    )}\n`
  );

  console.log("\nAdmin UI deployment complete.");
  console.log(`Admin URL: ${adminUrl}`);
  console.log(`Inventory: ${inventoryPath}`);
  console.log(`Set Lambda AppUrl to ${adminUrl} for auth email links.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
