/**
 * E2E: channels list, manual connect, health, disconnect
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const API = process.env.API_URL ?? "http://localhost:3001";
const TABLE = process.env.TABLE_NAME ?? "CommerceChat-Main";
const email = `channels-${Date.now()}@example.com`;
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
  console.log("=== Signup + login ===");
  await reqOk("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storeName: "Channels Test Store",
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

  console.log("\n=== List channels (disconnected) ===");
  const before = await reqOk("/api/v1/channels", { headers: auth });
  const waBefore = before.data.channels.find((c) => c.channel === "whatsapp");
  if (waBefore?.status !== "disconnected") throw new Error("expected disconnected whatsapp");

  const token = process.env.META_DEV_ACCESS_TOKEN;
  const wabaId = process.env.META_DEV_WABA_ID;
  const phoneNumberId = process.env.META_DEV_PHONE_NUMBER_ID;
  const displayPhone = process.env.META_DEV_DISPLAY_PHONE;
  if (!token || !wabaId || !phoneNumberId) {
    console.log("Skip manual connect — set META_DEV_* in apps/api/.env");
    return;
  }

  console.log("\n=== Manual connect (dev token) ===");
  const connected = await reqOk("/api/v1/channels/meta/connect", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken: token, wabaId, phoneNumberId, displayPhone }),
  });
  if (!connected.data.whatsapp?.phoneNumberId) throw new Error("connect failed");
  console.log("connected:", connected.data.whatsapp.displayPhone);

  console.log("\n=== Health ===");
  const health = await reqOk("/api/v1/channels/meta/health", { headers: auth });
  console.log("whatsapp health:", health.data.whatsapp);

  console.log("\n=== Disconnect ===");
  const delRes = await fetch(`${API}/api/v1/channels/meta/whatsapp`, {
    method: "DELETE",
    headers: auth,
  });
  if (delRes.status !== 204) throw new Error(`disconnect ${delRes.status}`);

  console.log("\n=== PASS ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
