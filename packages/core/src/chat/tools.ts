import type { AuthContext, ChatIntent } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getProductBySku, getStoreCurrency, searchProductCache } from "../catalog/products";
import { lookupWordPressOrder } from "../commerce/wordpress/service";
import { getTenantConfig } from "../tenant/service";
import { retrieveKnowledge } from "../ingest/retrieve";
import type { ToolDefinition } from "../llm/types";
import { addToCart, getOrCreateCart, loadCart } from "./cart";

export const TOOL_DEFINITIONS: Record<string, ToolDefinition> = {
  search_products: {
    name: "search_products",
    description: "Search the store product catalog by query, category, or price range",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms" },
        category: { type: "string" },
        maxPrice: { type: "number" },
        minPrice: { type: "number" },
        limit: { type: "integer", default: 5 },
      },
      required: ["query"],
    },
  },
  get_product_details: {
    name: "get_product_details",
    description: "Get full details for a product by SKU",
    parameters: {
      type: "object",
      properties: { sku: { type: "string" } },
      required: ["sku"],
    },
  },
  add_to_cart: {
    name: "add_to_cart",
    description: "Add a product to the customer's cart",
    parameters: {
      type: "object",
      properties: {
        sku: { type: "string" },
        quantity: { type: "integer", default: 1 },
        variant: { type: "string", description: "Size, color, etc." },
      },
      required: ["sku", "quantity"],
    },
  },
  get_cart: {
    name: "get_cart",
    description: "Get the current cart contents for this conversation",
    parameters: { type: "object", properties: {}, required: [] },
  },
  create_checkout_link: {
    name: "create_checkout_link",
    description: "Generate a checkout link for the current cart",
    parameters: {
      type: "object",
      properties: { confirmWithCustomer: { type: "boolean", default: true } },
      required: [],
    },
  },
  get_order_status: {
    name: "get_order_status",
    description: "Look up order status by order ID",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string" },
        email: { type: "string" },
      },
      required: ["orderId"],
    },
  },
};

export function toolsForIntent(intent: ChatIntent): ToolDefinition[] {
  const names: string[] = [];
  if (intent === "product" || intent === "checkout") {
    names.push("search_products", "get_product_details", "add_to_cart");
  }
  if (intent === "checkout") {
    names.push("get_cart", "create_checkout_link", "get_order_status");
  }
  if (intent === "faq") {
    names.push("get_order_status");
  }
  return names.map((n) => TOOL_DEFINITIONS[n]!);
}

export interface ToolExecutionContext {
  auth: AuthContext;
  config: CoreConfig;
  conversationId: string;
  checkoutBaseUrl?: string;
  channel?: string;
  externalUserId?: string;
}

export async function executeTool(
  name: string,
  argsJson: string,
  ctx: ToolExecutionContext
): Promise<{ result: unknown; success: boolean }> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    return { result: { error: "Invalid tool arguments" }, success: false };
  }

  switch (name) {
    case "search_products": {
      const query = String(args.query ?? "");
      const limit = Number(args.limit ?? 5);
      const storeCurrency = await getStoreCurrency(ctx.auth.tenantId, ctx.config);
      const [vectorHits, cacheHits] = await Promise.all([
        retrieveKnowledge(ctx.auth, query, ctx.config, { topK: limit, sourceType: "catalog" }),
        searchProductCache(ctx.auth.tenantId, query, ctx.config, {
          category: args.category as string | undefined,
          maxPrice: args.maxPrice as number | undefined,
          minPrice: args.minPrice as number | undefined,
          limit,
        }),
      ]);
      const fromVectors = cacheHits.length
        ? cacheHits
        : vectorHits.map((h) => ({
            sku: h.chunk.metadata.sku ?? h.chunk.id,
            name: h.chunk.metadata.title ?? "Product",
            description: h.chunk.text.slice(0, 200),
            price: 0,
            currency: storeCurrency,
            inStock: true,
            productUrl: h.chunk.metadata.url,
          }));
      return {
        success: true,
        result: {
          products: fromVectors.map((p) => ({
            sku: p.sku,
            name: p.name,
            description: p.description,
            price: p.price,
            currency: p.currency,
            inStock: p.inStock,
            imageUrl: "imageUrl" in p ? p.imageUrl : undefined,
            imageUrls: "imageUrls" in p ? p.imageUrls : undefined,
            url: p.productUrl,
          })),
          totalFound: fromVectors.length,
        },
      };
    }
    case "get_product_details": {
      const sku = String(args.sku ?? "");
      const product = await getProductBySku(ctx.auth.tenantId, sku, ctx.config);
      if (!product) return { result: { error: "Product not found" }, success: false };
      return { success: true, result: { product } };
    }
    case "add_to_cart": {
      const sku = String(args.sku ?? "");
      const quantity = Number(args.quantity ?? 1);
      const variant = args.variant as string | undefined;
      const outcome = await addToCart(
        ctx.auth.tenantId,
        ctx.conversationId,
        sku,
        quantity,
        variant,
        ctx.config
      );
      if (!outcome.success) return { result: { error: outcome.error }, success: false };
      return { success: true, result: { sku, cart: outcome.cart } };
    }
    case "get_cart": {
      const cart =
        (await loadCart(ctx.auth.tenantId, ctx.conversationId, ctx.config)) ??
        (await getOrCreateCart(ctx.auth.tenantId, ctx.conversationId, ctx.config));
      return { success: true, result: { cart } };
    }
    case "create_checkout_link": {
      const cart = await loadCart(ctx.auth.tenantId, ctx.conversationId, ctx.config);
      if (!cart?.items.length) {
        return { result: { error: "Cart is empty" }, success: false };
      }
      const base = ctx.checkoutBaseUrl || "https://checkout.commercechat.com";
      const url = `${base}/${ctx.auth.tenantId}/${cart.cartId}`;
      return { success: true, result: { checkoutUrl: url, cart } };
    }
    case "get_order_status": {
      const tenantConfig = await getTenantConfig(ctx.auth, ctx.config);
      const connector = tenantConfig.data!.commerceConnector;
      const orderId = args.orderId ? String(args.orderId) : undefined;
      const phoneFromChannel =
        !orderId && (ctx.channel === "whatsapp" || ctx.channel === "messenger")
          ? ctx.externalUserId
          : undefined;

      if (connector.type === "woocommerce" && connector.status === "connected") {
        const lookup = await lookupWordPressOrder(ctx.auth.tenantId, ctx.config, {
          orderId,
          phone: phoneFromChannel,
        });
        if (lookup.found) {
          return {
            success: true,
            result: "order" in lookup ? lookup.order : { orders: lookup.orders },
          };
        }
        return { success: false, result: { message: lookup.message } };
      }

      return {
        success: true,
        result: {
          message:
            "Order lookup is not connected yet. Please contact the store with your order ID.",
          orderId,
        },
      };
    }
    default:
      return { result: { error: `Unknown tool: ${name}` }, success: false };
  }
}
