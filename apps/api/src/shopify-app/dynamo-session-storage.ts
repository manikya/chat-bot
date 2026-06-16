import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Session } from "@shopify/shopify-api";
import { getDocClient, loadConfig } from "@commercechat/core";

const SESSION_PK = "PLATFORM#SHOPIFY_APP";
const OAUTH_PK = "PLATFORM#SHOPIFY_OAUTH";

export class DynamoSessionStorage {
  private config = loadConfig();

  async storeSession(session: Session): Promise<boolean> {
    const db = getDocClient(this.config);
    await db.send(
      new PutCommand({
        TableName: this.config.tableName,
        Item: {
          PK: SESSION_PK,
          SK: session.id,
          shop: session.shop,
          payload: JSON.stringify(session.toObject()),
          updatedAt: new Date().toISOString(),
        },
      })
    );
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const db = getDocClient(this.config);
    const res = await db.send(
      new GetCommand({
        TableName: this.config.tableName,
        Key: { PK: SESSION_PK, SK: id },
      })
    );
    if (!res.Item?.payload) return undefined;
    const data = JSON.parse(res.Item.payload as string) as Record<string, string | boolean | number>;
    return new Session({
      id: String(data.id),
      shop: String(data.shop),
      state: String(data.state ?? ""),
      isOnline: Boolean(data.isOnline),
      accessToken: data.accessToken ? String(data.accessToken) : undefined,
      scope: data.scope ? String(data.scope) : undefined,
      expires: data.expires ? Number(data.expires) : undefined,
    });
  }

  async deleteSession(id: string): Promise<boolean> {
    const db = getDocClient(this.config);
    await db.send(
      new DeleteCommand({
        TableName: this.config.tableName,
        Key: { PK: SESSION_PK, SK: id },
      })
    );
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    for (const id of ids) await this.deleteSession(id);
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const db = getDocClient(this.config);
    const res = await db.send(
      new QueryCommand({
        TableName: this.config.tableName,
        KeyConditionExpression: "PK = :pk",
        FilterExpression: "shop = :shop",
        ExpressionAttributeValues: { ":pk": SESSION_PK, ":shop": shop },
      })
    );
    const sessions: Session[] = [];
    for (const item of res.Items ?? []) {
      if (!item.payload) continue;
      const data = JSON.parse(item.payload as string) as Record<string, string | boolean | number>;
      sessions.push(
        new Session({
          id: String(data.id),
          shop: String(data.shop),
          state: String(data.state ?? ""),
          isOnline: Boolean(data.isOnline),
          accessToken: data.accessToken ? String(data.accessToken) : undefined,
          scope: data.scope ? String(data.scope) : undefined,
          expires: data.expires ? Number(data.expires) : undefined,
        })
      );
    }
    return sessions;
  }
}

/** Prevent parallel Lambda invocations from exchanging the same OAuth code twice. */
export async function claimOAuthCode(code: string): Promise<boolean> {
  const config = loadConfig();
  const db = getDocClient(config);
  try {
    await db.send(
      new PutCommand({
        TableName: config.tableName,
        Item: {
          PK: OAUTH_PK,
          SK: code,
          createdAt: new Date().toISOString(),
        },
        ConditionExpression: "attribute_not_exists(SK)",
      })
    );
    return true;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return false;
    throw err;
  }
}

export async function releaseOAuthCode(code: string): Promise<void> {
  const config = loadConfig();
  const db = getDocClient(config);
  await db.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: { PK: OAUTH_PK, SK: code },
    })
  );
}
