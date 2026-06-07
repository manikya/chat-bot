/**
 * E2E: usage API, widget chat (API key), conversations list/messages
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const API = process.env.API_URL ?? "http://localhost:3001";
const TABLE = process.env.TABLE_NAME ?? "CommerceChat-Main";
const email = `features-${Date.now()}@example.com`;
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
  const json = await res.json();
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
  console.log("=== Signup + login ===");
  await reqOk("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storeName: "Features Test Store",
      name: "Tester",
      email,
      password,
      timezone: "America/New_York",
    }),
  });
  await verifyEmailLocal(email.toLowerCase());

  const login = await reqOk("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const auth = { Authorization: `Bearer ${login.data.accessToken}` };

  console.log("\n=== Usage (before chat) ===");
  const usageBefore = await reqOk("/api/v1/tenants/me/usage", { headers: auth });
  console.log("messages:", usageBefore.data.messages, "remaining:", usageBefore.data.limits.messagesRemaining);

  console.log("\n=== Regenerate widget API key ===");
  const keyRes = await reqOk("/api/v1/tenants/me/widget/regenerate-key", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: "{}",
  });
  const apiKey = keyRes.data.apiKey;
  if (!apiKey?.startsWith("pk_live_")) throw new Error("expected pk_live_ API key");

  console.log("\n=== Widget config (API key) ===");
  const widgetCfg = await reqOk("/api/v1/widget/config", {
    headers: { "X-API-Key": apiKey },
  });
  if (!widgetCfg.data.storeName) throw new Error("missing storeName");

  const sessionId = `web_sess_${Date.now()}`;
  console.log("\n=== Widget chat ===");
  const chat = await reqOk("/api/v1/widget/chat", {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message: "Hello from widget" }),
  });
  if (!chat.data.conversationId) throw new Error("missing conversationId");
  console.log("reply:", chat.data.reply.content.slice(0, 100));

  console.log("\n=== Admin chat (creates test conversation) ===");
  await reqOk("/api/v1/chat", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Show me sneakers", channel: "test" }),
  });

  console.log("\n=== Usage (after chat) ===");
  const usageAfter = await reqOk("/api/v1/tenants/me/usage", { headers: auth });
  if (usageAfter.data.messages < usageBefore.data.messages + 2) {
    throw new Error(`expected >=2 more messages, before=${usageBefore.data.messages} after=${usageAfter.data.messages}`);
  }
  console.log("messages:", usageAfter.data.messages, "tokens in:", usageAfter.data.inputTokens);

  console.log("\n=== Conversations list ===");
  const convs = await reqOk("/api/v1/conversations", { headers: auth });
  if (!convs.data.items?.length) throw new Error("expected conversations");
  console.log("found", convs.data.items.length, "conversations");

  const webConv = convs.data.items.find((c) => c.channel === "web");
  const testConv = convs.data.items.find((c) => c.channel === "test");
  if (!webConv) throw new Error("expected web conversation");
  if (!testConv) throw new Error("expected test conversation");

  console.log("\n=== Conversation detail + messages ===");
  const detail = await reqOk(`/api/v1/conversations/${webConv.conversationId}`, { headers: auth });
  if (detail.data.conversationId !== webConv.conversationId) throw new Error("detail mismatch");

  const messages = await reqOk(`/api/v1/conversations/${webConv.conversationId}/messages`, { headers: auth });
  if (messages.data.items.length < 2) throw new Error("expected inbound+outbound messages");
  console.log("messages in thread:", messages.data.items.length);

  console.log("\n=== ALL FEATURE TESTS PASSED ===");
}

main().catch((e) => {
  console.error("\nFAILED:", e.message ?? e);
  process.exit(1);
});
