import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { generateId } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import type { CatalogProduct } from "../ingest/parsers/catalog-csv";
import { sendInstagramReply } from "../meta/instagram-outbound";
import { sendMessengerReply } from "../meta/messenger-outbound";

export interface WishlistReminder {
  reminderId: string;
  tenantId: string;
  conversationId: string;
  channel: string;
  externalUserId: string;
  sku: string;
  productName: string;
  status: "waiting" | "notified";
  createdAt: string;
  updatedAt: string;
}

export async function addWishlistReminder(
  input: Omit<WishlistReminder, "reminderId" | "status" | "createdAt" | "updatedAt">,
  config: CoreConfig
): Promise<WishlistReminder> {
  const now = new Date().toISOString();
  const reminder: WishlistReminder = {
    ...input,
    reminderId: generateId("wish_"),
    status: "waiting",
    createdAt: now,
    updatedAt: now,
  };

  const db = getDocClient(config);
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(input.tenantId),
        SK: Keys.wishlistReminder(input.conversationId, input.sku),
        ...reminder,
      },
    })
  );

  return reminder;
}

async function listWaitingRemindersForSku(
  tenantId: string,
  sku: string,
  config: CoreConfig
): Promise<WishlistReminder[]> {
  const db = getDocClient(config);
  const res = await db.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      FilterExpression: "#sku = :sku AND #status = :status",
      ExpressionAttributeNames: {
        "#sku": "sku",
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(tenantId),
        ":sk": "WISHLIST#",
        ":sku": sku,
        ":status": "waiting",
      },
    })
  );
  return (res.Items ?? []).map((item) => {
    const { PK: _pk, SK: _sk, ...reminder } = item;
    return reminder as WishlistReminder;
  });
}

async function markReminderNotified(reminder: WishlistReminder, config: CoreConfig) {
  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: {
        PK: Keys.tenantPk(reminder.tenantId),
        SK: Keys.wishlistReminder(reminder.conversationId, reminder.sku),
      },
      UpdateExpression: "SET #status = :status, #updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#status": "status",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":status": "notified",
        ":updatedAt": new Date().toISOString(),
      },
    })
  );
}

async function sendReminder(reminder: WishlistReminder, product: CatalogProduct, config: CoreConfig) {
  const text = `Good news — ${product.name} is back in stock. Want me to help you checkout?`;
  if (reminder.channel === "whatsapp") {
    console.warn("[wishlist] skipping WhatsApp reminder without phone number ID", {
      tenantId: reminder.tenantId,
      conversationId: reminder.conversationId,
      sku: reminder.sku,
    });
    return false;
  } else if (reminder.channel === "messenger") {
    await sendMessengerReply(reminder.tenantId, reminder.externalUserId, text, config);
  } else if (reminder.channel === "instagram") {
    await sendInstagramReply(reminder.tenantId, reminder.externalUserId, text, config);
  } else {
    return false;
  }
  return true;
}

export async function notifyWishlistRemindersForProducts(
  tenantId: string,
  products: CatalogProduct[],
  config: CoreConfig
): Promise<{ notified: number; waiting: number }> {
  let notified = 0;
  let waiting = 0;
  for (const product of products) {
    if (!product.inStock) continue;
    const reminders = await listWaitingRemindersForSku(tenantId, product.sku, config);
    for (const reminder of reminders) {
      const sent = await sendReminder(reminder, product, config);
      if (sent) {
        await markReminderNotified(reminder, config);
        notified++;
      } else {
        waiting++;
      }
    }
  }
  return { notified, waiting };
}
