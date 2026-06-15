import { DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, ErrorCodes, ok, type AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { assertNotViewer } from "../auth/roles";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { expoDeviceKey } from "../push/expo";

export interface RegisterPushDeviceBody {
  expoPushToken: string;
  platform?: "ios" | "android" | "web" | string;
}

export async function registerPushDevice(
  auth: AuthContext,
  body: RegisterPushDeviceBody,
  config: CoreConfig
) {
  assertNotViewer(auth);

  const token = body.expoPushToken?.trim();
  if (!token || (!token.startsWith("ExponentPushToken[") && !token.startsWith("ExpoPushToken["))) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Invalid Expo push token", 400);
  }

  const deviceKey = expoDeviceKey(token);
  const now = new Date().toISOString();
  const db = getDocClient(config);

  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(auth.tenantId),
        SK: Keys.pushDevice(auth.userId, deviceKey),
        userId: auth.userId,
        expoPushToken: token,
        platform: body.platform ?? "unknown",
        updatedAt: now,
      },
    })
  );

  return ok({
    registered: true,
    deviceKey,
    platform: body.platform ?? "unknown",
  });
}

export async function unregisterPushDevice(
  auth: AuthContext,
  body: RegisterPushDeviceBody,
  config: CoreConfig
) {
  const token = body.expoPushToken?.trim();
  if (!token) {
    return ok({ unregistered: false });
  }

  const deviceKey = expoDeviceKey(token);
  const db = getDocClient(config);
  await db.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: {
        PK: Keys.tenantPk(auth.tenantId),
        SK: Keys.pushDevice(auth.userId, deviceKey),
      },
    })
  );

  return ok({ unregistered: true });
}

export async function listTenantPushTokens(tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const tokens: string[] = [];
  const keys: Array<{ userId: string; deviceKey: string }> = [];
  let startKey: Record<string, unknown> | undefined;

  do {
    const res = await db.send(
      new QueryCommand({
        TableName: config.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": Keys.tenantPk(tenantId),
          ":sk": "PUSH#",
        },
        ExclusiveStartKey: startKey,
      })
    );

    for (const item of res.Items ?? []) {
      const sk = String(item.SK ?? "");
      const parts = sk.split("#");
      const userId = parts[1];
      const deviceKey = parts[2];
      const expoPushToken = item.expoPushToken as string | undefined;
      if (userId && deviceKey && expoPushToken) {
        tokens.push(expoPushToken);
        keys.push({ userId, deviceKey });
      }
    }
    startKey = res.LastEvaluatedKey;
  } while (startKey);

  return { tokens, keys };
}

export async function deletePushDevice(
  tenantId: string,
  userId: string,
  deviceKey: string,
  config: CoreConfig
) {
  const db = getDocClient(config);
  await db.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.pushDevice(userId, deviceKey),
      },
    })
  );
}
