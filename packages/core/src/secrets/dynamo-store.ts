import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";

export async function getDynamoSecret<T>(
  config: CoreConfig,
  tenantId: string,
  namespace: string
): Promise<T | null> {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.tenantSecret(namespace),
      },
    })
  );
  if (!res.Item?.payload) return null;
  try {
    return (typeof res.Item.payload === "string"
      ? JSON.parse(res.Item.payload)
      : res.Item.payload) as T;
  } catch {
    return null;
  }
}

export async function putDynamoSecret(
  config: CoreConfig,
  tenantId: string,
  namespace: string,
  value: unknown
): Promise<void> {
  const db = getDocClient(config);
  const now = new Date().toISOString();
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.tenantSecret(namespace),
        payload: value,
        updatedAt: now,
      },
    })
  );
}

export async function deleteDynamoSecret(
  config: CoreConfig,
  tenantId: string,
  namespace: string
): Promise<void> {
  const db = getDocClient(config);
  await db.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.tenantSecret(namespace),
      },
    })
  );
}
