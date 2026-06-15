#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

function parseCredentialsCsv(path) {
  const lines = readFileSync(path, "utf8").trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const vals = lines[1].split(",").map((v) => v.trim());
  const row = Object.fromEntries(headers.map((h, i) => [h, vals[i]]));
  return {
    accessKeyId: row["Access key ID"],
    secretAccessKey: row["Secret access key"],
  };
}

const creds = parseCredentialsCsv(
  process.env.AWS_CREDENTIALS_CSV ?? "/Users/manikya/Downloads/manikya_accessKeys (1).csv"
);
const tableName = process.env.TABLE_NAME ?? "commercechat-dev-storage-main";
const db = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: creds,
  })
);

const messengerRes = await db.send(
  new ScanCommand({
    TableName: tableName,
    FilterExpression: "SK = :sk",
    ExpressionAttributeValues: { ":sk": "CHANNEL#messenger" },
  })
);

console.log("=== Messenger channels ===");
for (const item of messengerRes.Items ?? []) {
  const tenantId = String(item.PK).replace(/^TENANT#/, "");
  console.log({ tenantId, pageId: item.pageId, pageName: item.pageName, status: item.status });

  if (item.pageId) {
    const route = await db.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: `PAGE#${item.pageId}`, SK: "TENANT" },
      })
    );
    console.log("  page routing:", route.Item ?? "MISSING");
  }
}
