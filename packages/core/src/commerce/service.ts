import { ok, type AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { listProductItems, searchProductCache } from "../catalog/products";

function toProductListItem(item: {
  sku: string;
  name: string;
  price: number;
  currency: string;
  inStock: boolean;
  imageUrl?: string;
}) {
  return {
    sku: item.sku,
    name: item.name,
    price: item.price,
    currency: item.currency,
    inStock: item.inStock,
    imageUrl: item.imageUrl,
  };
}

export async function listCommerceProducts(
  auth: AuthContext,
  config: CoreConfig,
  options?: { q?: string; limit?: number }
) {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const query = options?.q?.trim() ?? "";

  if (query) {
    const records = await searchProductCache(auth.tenantId, query, config, { limit });
    return ok({ items: records.map(toProductListItem) });
  }

  const items = (await listProductItems(auth.tenantId, config)).slice(0, limit);
  return ok({
    items: items.map((item) =>
      toProductListItem({
        sku: item.sku as string,
        name: item.name as string,
        price: Number(item.price ?? 0),
        currency: (item.currency as string) ?? "USD",
        inStock: Boolean(item.inStock),
        imageUrl: item.imageUrl as string | undefined,
      })
    ),
  });
}
