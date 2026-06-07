/**
 * E2E: dashboard stats + widget bundle served + widget chat
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const API = process.env.API_URL ?? "http://localhost:3001";
const TABLE = process.env.TABLE_NAME ?? "CommerceChat-Main";
const email = `dash-widget-${Date.now()}@example.com`;
const password = "TestPassword123!";

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: "us-east-1",
    endpoint: process.env.DYNAMODB_ENDPOINT ?? "http://localhost:4566",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  })
);

async function reqOk(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function verifyEmailLocal(normalizedEmail) {
  const lookup = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `EMAIL#${normalizedEmail}`, SK: "USER" },
    })
  );
  const { tenantId, userId } = lookup.Item;
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `TENANT#${tenantId}`, SK: `USER#${userId}` },
      UpdateExpression: "SET emailVerified = :v",
      ExpressionAttributeValues: { ":v": true },
    })
  );
}

async function main() {
  await reqOk("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storeName: "Widget Demo Store",
      name: "Tester",
      email,
      password,
      timezone: "UTC",
    }),
  });
  await verifyEmailLocal(email.toLowerCase());

  const login = await reqOk("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const auth = { Authorization: `Bearer ${login.data.accessToken}` };

  const statsBefore = await reqOk("/api/v1/dashboard/stats", { headers: auth });
  if (typeof statsBefore.data.messagesThisMonth !== "number") {
    throw new Error("dashboard stats missing messagesThisMonth");
  }

  const keyRes = await reqOk("/api/v1/tenants/me/widget/regenerate-key", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: "{}",
  });
  const apiKey = keyRes.data.apiKey;
  if (!keyRes.data.embedCode?.includes("/widget/v1.js")) {
    throw new Error("embedCode should reference /widget/v1.js");
  }

  const jsRes = await fetch(`${API}/widget/v1.js`);
  const js = await jsRes.text();
  if (!jsRes.ok || !js.includes("CommerceChat")) {
    throw new Error("widget v1.js not served");
  }

  await reqOk("/api/v1/widget/chat", {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: "demo_sess_1", message: "Hello widget" }),
  });

  const statsAfter = await reqOk("/api/v1/dashboard/stats", { headers: auth });
  if (statsAfter.data.messagesThisMonth < statsBefore.data.messagesThisMonth + 1) {
    throw new Error("expected messagesThisMonth to increase after widget chat");
  }
  if (statsAfter.data.activeConversations < 1) {
    throw new Error("expected at least one active conversation");
  }

  console.log("Dashboard:", {
    messagesToday: statsAfter.data.messagesToday,
    messagesThisMonth: statsAfter.data.messagesThisMonth,
    activeConversations: statsAfter.data.activeConversations,
    quotaPercent: statsAfter.data.quotaPercent,
  });
  console.log("Widget JS size:", js.length, "bytes");
  console.log("\n=== ALL DASHBOARD + WIDGET TESTS PASSED ===");
}

main().catch((e) => {
  console.error("\nFAILED:", e.message ?? e);
  process.exit(1);
});
