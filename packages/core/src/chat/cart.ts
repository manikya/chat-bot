import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { generateId } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { getProductBySku, getStoreCurrency } from "../catalog/products";

export interface CartItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  variant?: string;
}

export interface CartState {
  cartId: string;
  conversationId: string;
  tenantId: string;
  items: CartItem[];
  subtotal: number;
  currency: string;
  updatedAt: string;
}

export async function loadCart(
  tenantId: string,
  conversationId: string,
  config: CoreConfig
): Promise<CartState | null> {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.cart(conversationId) },
    })
  );
  if (!res.Item) return null;
  const { PK: _pk, SK: _sk, ...cart } = res.Item;
  return cart as CartState;
}

async function saveCart(cart: CartState, config: CoreConfig) {
  const db = getDocClient(config);
  const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: { PK: Keys.tenantPk(cart.tenantId), SK: Keys.cart(cart.conversationId), ...cart, ttl },
    })
  );
}

function recalcSubtotal(items: CartItem[]) {
  return items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
}

export async function getOrCreateCart(
  tenantId: string,
  conversationId: string,
  config: CoreConfig
): Promise<CartState> {
  const existing = await loadCart(tenantId, conversationId, config);
  if (existing) return existing;
  const now = new Date().toISOString();
  const currency = await getStoreCurrency(tenantId, config);
  const cart: CartState = {
    cartId: generateId("cart_"),
    conversationId,
    tenantId,
    items: [],
    subtotal: 0,
    currency,
    updatedAt: now,
  };
  await saveCart(cart, config);
  return cart;
}

export async function addToCart(
  tenantId: string,
  conversationId: string,
  sku: string,
  quantity: number,
  variant: string | undefined,
  config: CoreConfig
) {
  const product = await getProductBySku(tenantId, sku, config);
  if (!product) return { success: false as const, error: "Product not found" };
  if (!product.inStock) return { success: false as const, error: "Out of stock" };

  const cart = await getOrCreateCart(tenantId, conversationId, config);
  const existing = cart.items.find((i) => i.sku === sku && i.variant === variant);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.items.push({
      sku,
      name: product.name,
      quantity,
      unitPrice: product.price,
      variant,
    });
  }
  cart.subtotal = recalcSubtotal(cart.items);
  cart.currency = product.currency || cart.currency;
  cart.updatedAt = new Date().toISOString();
  await saveCart(cart, config);
  return { success: true as const, cart, sku };
}

export async function clearCart(
  tenantId: string,
  conversationId: string,
  config: CoreConfig
): Promise<CartState | null> {
  const cart = await loadCart(tenantId, conversationId, config);
  if (!cart) return null;
  cart.items = [];
  cart.subtotal = 0;
  cart.updatedAt = new Date().toISOString();
  await saveCart(cart, config);
  return cart;
}

export async function removeCartItems(
  tenantId: string,
  conversationId: string,
  skus: string[],
  config: CoreConfig
): Promise<CartState | null> {
  const cart = await loadCart(tenantId, conversationId, config);
  if (!cart) return null;
  const remove = new Set(skus.map((sku) => sku.toUpperCase()));
  cart.items = cart.items.filter((item) => !remove.has(item.sku.toUpperCase()));
  cart.subtotal = recalcSubtotal(cart.items);
  cart.updatedAt = new Date().toISOString();
  await saveCart(cart, config);
  return cart;
}

export async function deleteCart(
  tenantId: string,
  conversationId: string,
  config: CoreConfig
) {
  const db = getDocClient(config);
  await db.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.cart(conversationId) },
    })
  );
}
