import { ApiError, ErrorCodes, type AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import type { CartState } from "../chat/cart";
import { getTenantConfig } from "../tenant/service";
import { createShopifyDraftOrder, fetchAllShopifyProducts } from "./shopify/client";
import { loadShopifyCredentials } from "./shopify/credentials";
import { createWordPressCheckout } from "./wordpress/client";
import { loadWordPressCredentials } from "./wordpress/credentials";

export interface CommerceCheckoutResult {
  provider: "woocommerce" | "shopify";
  checkoutUrl: string;
  externalCheckoutId: string;
}

function shopifyVariantIdFromCartSku(
  products: Awaited<ReturnType<typeof fetchAllShopifyProducts>>,
  sku: string
) {
  const normalized = sku.trim().toLowerCase();
  for (const product of products) {
    for (const variant of product.variants ?? []) {
      if (variant.sku?.trim().toLowerCase() === normalized) return variant.id;
    }
    if (normalized === `shopify-${product.id}`.toLowerCase()) {
      const firstVariant = product.variants?.[0];
      if (firstVariant) return firstVariant.id;
    }
  }
  return null;
}

export async function createCommerceCheckout(
  auth: AuthContext,
  config: CoreConfig,
  cart: CartState,
  options?: {
    channel?: string;
    externalUserId?: string;
  }
): Promise<CommerceCheckoutResult | null> {
  const tenantConfig = await getTenantConfig(auth, config);
  const connector = tenantConfig.data?.commerceConnector;
  if (!connector || connector.status !== "connected") return null;

  if (connector.type === "woocommerce") {
    const creds = await loadWordPressCredentials(auth.tenantId, config);
    if (!creds) return null;
    const checkout = await createWordPressCheckout(creds, config, {
      cartId: cart.cartId,
      conversationId: cart.conversationId,
      customerPhone:
        options?.channel === "whatsapp" || options?.channel === "messenger"
          ? options.externalUserId
          : undefined,
      lineItems: cart.items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
      })),
    });
    return {
      provider: "woocommerce",
      checkoutUrl: checkout.checkout_url,
      externalCheckoutId: String(checkout.order_id),
    };
  }

  if (connector.type === "shopify") {
    const creds = await loadShopifyCredentials(auth.tenantId, config);
    if (!creds) return null;
    const products = await fetchAllShopifyProducts(creds, config);
    const lineItems = cart.items.map((item) => {
      const variantId = shopifyVariantIdFromCartSku(products, item.sku);
      if (!variantId) {
        throw new ApiError(
          ErrorCodes.VALIDATION_ERROR,
          `Could not find Shopify variant for ${item.sku}`,
          400
        );
      }
      return { variantId, quantity: item.quantity };
    });
    const draftOrder = await createShopifyDraftOrder(creds, config, {
      conversationId: cart.conversationId,
      cartId: cart.cartId,
      lineItems,
    });
    return {
      provider: "shopify",
      checkoutUrl: draftOrder.invoice_url,
      externalCheckoutId: String(draftOrder.id),
    };
  }

  return null;
}
