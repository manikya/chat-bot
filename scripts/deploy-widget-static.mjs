#!/usr/bin/env node
/**
 * Deploy embeddable widget bundle (v1.js) to S3 + CloudFront (widget-cdn cost group).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const WIDGET_JS = join(ROOT, "apps/widget/public/v1.js");
const WIDGET_DEMO = join(ROOT, "apps/widget/demo.html");
const INVENTORY_DIR = join(ROOT, "infra/deployments");

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
    return { ok: true, stdout: sh("aws", args, { env: awsEnv }) };
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
    { Key: "Component", Value: "widget" },
    { Key: "CostGroup", Value: "widget-cdn" },
    { Key: "DataClass", Value: "public" },
  ];
}

function buildTemplate(env) {
  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: `CommerceChat ${env} widget CDN (S3 + CloudFront)`,
    Parameters: {
      Environment: { Type: "String", Default: env },
    },
    Resources: {
      WidgetBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: { "Fn::Sub": `commercechat-\${Environment}-widget-\${AWS::AccountId}-\${AWS::Region}` },
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
          },
          Tags: resourceTags(env),
        },
      },
      WidgetOriginAccessControl: {
        Type: "AWS::CloudFront::OriginAccessControl",
        Properties: {
          OriginAccessControlConfig: {
            Name: { "Fn::Sub": `commercechat-\${Environment}-widget-oac` },
            OriginAccessControlOriginType: "s3",
            SigningBehavior: "always",
            SigningProtocol: "sigv4",
          },
        },
      },
      WidgetDistribution: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: {
            Enabled: true,
            Comment: { "Fn::Sub": `CommerceChat \${Environment} widget CDN` },
            HttpVersion: "http2and3",
            Origins: [
              {
                Id: "WidgetS3",
                DomainName: { "Fn::GetAtt": ["WidgetBucket", "RegionalDomainName"] },
                OriginAccessControlId: { "Fn::GetAtt": ["WidgetOriginAccessControl", "Id"] },
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
            DefaultCacheBehavior: {
              TargetOriginId: "WidgetS3",
              ViewerProtocolPolicy: "redirect-to-https",
              AllowedMethods: ["GET", "HEAD", "OPTIONS"],
              CachedMethods: ["GET", "HEAD"],
              Compress: true,
              ForwardedValues: {
                QueryString: false,
                Cookies: { Forward: "none" },
              },
            },
          },
          Tags: resourceTags(env),
        },
      },
      WidgetBucketPolicy: {
        Type: "AWS::S3::BucketPolicy",
        Properties: {
          Bucket: { Ref: "WidgetBucket" },
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "AllowCloudFrontRead",
                Effect: "Allow",
                Principal: { Service: "cloudfront.amazonaws.com" },
                Action: "s3:GetObject",
                Resource: { "Fn::Sub": "${WidgetBucket.Arn}/*" },
                Condition: {
                  StringEquals: {
                    "AWS:SourceArn": {
                      "Fn::Sub":
                        "arn:aws:cloudfront::${AWS::AccountId}:distribution/${WidgetDistribution}",
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
      WidgetCdnUrl: {
        Value: { "Fn::Join": ["", ["https://", { "Fn::GetAtt": ["WidgetDistribution", "DomainName"] }]] },
      },
      WidgetBucketName: { Value: { Ref: "WidgetBucket" } },
      DistributionId: { Value: { Ref: "WidgetDistribution" } },
    },
  };
}

function runPreflight(awsEnv, region) {
  const checks = [
    ["s3:PutObject", ["s3api", "list-buckets", "--max-items", "1"]],
    ["cloudfront:CreateDistribution", ["cloudfront", "list-distributions", "--max-items", "1"]],
    ["cloudformation:CreateChangeSet", ["cloudformation", "describe-stacks", "--region", region, "--max-items", "1"]],
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
      `Widget deploy IAM preflight failed. Update CommerceChatDeploy policy and retry.\nMissing: ${missing.join(", ")}`
    );
  }
  console.log("IAM preflight checks passed.");
}

export function latestWidgetCdnUrl(env) {
  if (!existsSync(INVENTORY_DIR)) return null;
  const files = readdirSync(INVENTORY_DIR)
    .filter((name) => name.startsWith(`commercechat-${env}-widget-`) && name.endsWith(".json"))
    .sort();
  const latest = files.at(-1);
  if (!latest) return null;
  const inv = JSON.parse(readFileSync(join(INVENTORY_DIR, latest), "utf8"));
  return inv.widgetCdnUrl ?? null;
}

async function main() {
  const credentialsCsv = arg("credentials-csv", "/Users/manikya/Downloads/manikya_accessKeys (1).csv");
  const env = arg("env", "dev");
  const region = arg("region", "us-east-1");
  const stackName = arg("stack", `commercechat-${env}-widget`);

  if (!existsSync(credentialsCsv)) throw new Error(`Credentials CSV not found: ${credentialsCsv}`);
  if (!existsSync(WIDGET_JS)) throw new Error(`Widget bundle not found: ${WIDGET_JS}`);

  const creds = parseCredentialsCsv(credentialsCsv);
  const awsEnv = {
    ...process.env,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
    AWS_DEFAULT_REGION: region,
    AWS_REGION: region,
  };

  const caller = JSON.parse(sh("aws", ["sts", "get-caller-identity"], { env: awsEnv }));
  console.log(`Account ${caller.Account} | widget stack ${stackName}`);
  runPreflight(awsEnv, region);

  const templatePath = join(ROOT, ".aws-deploy", `widget-template-${env}.json`);
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
      "Component=widget",
      "CostGroup=widget-cdn",
    ],
    { env: awsEnv, stdio: "inherit" }
  );

  const stack = JSON.parse(
    sh("aws", ["cloudformation", "describe-stacks", "--stack-name", stackName, "--region", region], { env: awsEnv })
  ).Stacks?.[0];
  const outputs = Object.fromEntries((stack?.Outputs ?? []).map((o) => [o.OutputKey, o.OutputValue]));
  const bucket = outputs.WidgetBucketName;
  const distributionId = outputs.DistributionId;
  const widgetCdnUrl = outputs.WidgetCdnUrl;

  const stagingDir = join(ROOT, ".aws-deploy", "widget-staging");
  mkdirSync(join(stagingDir, "widget"), { recursive: true });
  writeFileSync(join(stagingDir, "widget", "v1.js"), readFileSync(WIDGET_JS, "utf8"));
  if (existsSync(WIDGET_DEMO)) {
    writeFileSync(join(stagingDir, "widget", "demo.html"), readFileSync(WIDGET_DEMO, "utf8"));
  }

  console.log(`Uploading widget assets to s3://${bucket}/...`);
  sh(
    "aws",
    [
      "s3",
      "cp",
      join(stagingDir, "widget", "v1.js"),
      `s3://${bucket}/widget/v1.js`,
      "--cache-control",
      "public,max-age=86400,immutable",
      "--content-type",
      "application/javascript",
      "--region",
      region,
    ],
    { env: awsEnv, stdio: "inherit" }
  );
  if (existsSync(join(stagingDir, "widget", "demo.html"))) {
    sh(
      "aws",
      [
        "s3",
        "cp",
        join(stagingDir, "widget", "demo.html"),
        `s3://${bucket}/widget/demo.html`,
        "--cache-control",
        "public,max-age=300",
        "--content-type",
        "text/html",
        "--region",
        region,
      ],
      { env: awsEnv, stdio: "inherit" }
    );
  }

  console.log("Invalidating CloudFront cache for /widget/*...");
  sh(
    "aws",
    ["cloudfront", "create-invalidation", "--distribution-id", distributionId, "--paths", "/widget/*"],
    { env: awsEnv, stdio: "inherit" }
  );

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
        widgetCdnUrl,
        widgetScriptUrl: `${widgetCdnUrl.replace(/\/$/, "")}/widget/v1.js`,
        bucket,
        distributionId,
      },
      null,
      2
    )}\n`
  );

  console.log("\nWidget CDN deployment complete.");
  console.log(`Widget CDN URL: ${widgetCdnUrl}`);
  console.log(`Embed script:   ${widgetCdnUrl}/widget/v1.js`);
  console.log(`Inventory:      ${inventoryPath}`);
  console.log(`Redeploy API with: --widget-cdn-url=${widgetCdnUrl}`);
}

if (process.argv[1]?.endsWith("deploy-widget-static.mjs")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
