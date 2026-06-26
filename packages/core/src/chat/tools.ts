import type { AuthContext, ChatIntent, ChatSubIntent, FunnelStage, QualificationState } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import {
  getProductBySku,
  getRelatedProducts,
  getStoreCurrency,
  productMatchReasons,
  searchProductCache,
  type CatalogSearchHints,
  type ProductRecord,
} from "../catalog/products";
import { rankProductsByRelevance } from "../catalog/product-search";
import { createCommerceCheckout } from "../commerce/checkout";
import { lookupWordPressOrder } from "../commerce/wordpress/service";
import { getTenantConfig } from "../tenant/service";
import { retrieveKnowledge } from "../ingest/retrieve";
import type { ScoredChunk } from "../ingest/types";
import type { ToolDefinition } from "../llm/types";
import { addToCart, getOrCreateCart, loadCart, recordCartCheckout } from "./cart";
import { messageMentionsProducts } from "./intent";
import { buildProductSearchQuery } from "./product-query";

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
        excludeSkus: {
          type: "array",
          items: { type: "string" },
          description: "Product SKUs to exclude when asking for more options",
        },
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
  compare_products: {
    name: "compare_products",
    description: "Compare 2–4 products by SKU (price, stock, category, description)",
    parameters: {
      type: "object",
      properties: {
        skus: {
          type: "array",
          items: { type: "string" },
          description: "Product SKUs to compare",
        },
      },
      required: ["skus"],
    },
  },
  get_related_products: {
    name: "get_related_products",
    description: "Get related products in the same category as a SKU or category name",
    parameters: {
      type: "object",
      properties: {
        sku: { type: "string" },
        category: { type: "string" },
        limit: { type: "integer", default: 5 },
      },
      required: [],
    },
  },
};

export function toolsForIntent(
  intent: ChatIntent,
  message?: string,
  funnelStage?: FunnelStage,
  subIntent?: ChatSubIntent,
  options?: { gateProductSearch?: boolean; allowedTools?: string[] }
): ToolDefinition[] {
  if (options?.gateProductSearch) {
    return [];
  }
  if (options && "allowedTools" in options) {
    return [
      ...new Set((options.allowedTools ?? []).map((name) => name.trim()).filter((name) => Boolean(TOOL_DEFINITIONS[name]))),
    ].map((name) => TOOL_DEFINITIONS[name]!);
  }
  const names: string[] = [];
  const wantsProducts = messageMentionsProducts(message ?? "");
  const inCartFlow = funnelStage === "cart" || funnelStage === "checkout";

  if (subIntent === "order_status") {
    return [TOOL_DEFINITIONS.get_order_status!];
  }
  if (subIntent === "cart_review") {
    names.push("get_cart");
  }
  if (subIntent === "checkout_ready" || subIntent === "cart_review") {
    names.push("get_cart", "create_checkout_link");
  }
  if (subIntent === "faq_objection") {
    names.push("get_order_status");
    if (wantsProducts) names.push("search_products", "get_product_details");
    return [...new Set(names)].map((n) => TOOL_DEFINITIONS[n]!);
  }
  if (
    (subIntent === "product_compare" || subIntent === "product_detail" || subIntent === "product_browse") &&
    (intent === "product" || intent === "checkout" || funnelStage === "compare")
  ) {
    names.push("search_products", "get_product_details", "add_to_cart", "get_related_products");
  }
  if (subIntent === "product_compare" || funnelStage === "compare") {
    names.push("compare_products");
  }
  if (intent === "product" || intent === "checkout" || funnelStage === "compare") {
    names.push("search_products", "get_product_details", "add_to_cart");
  }
  if (intent === "checkout" || inCartFlow) {
    names.push("get_cart", "create_checkout_link", "get_order_status");
  }
  if (intent === "faq") {
    names.push("get_order_status");
    if (wantsProducts) {
      names.push("search_products", "get_product_details");
    }
  }
  if ((intent === "greeting" || intent === "unknown") && wantsProducts) {
    names.push("search_products", "get_product_details");
  }
  return [...new Set(names)].map((n) => TOOL_DEFINITIONS[n]!);
}

async function mergeProductSearchResults(
  tenantId: string,
  vectorHits: ScoredChunk[],
  cacheHits: ProductRecord[],
  config: CoreConfig,
  storeCurrency: string,
  query: string,
  options?: {
    category?: string;
    requiredTerms?: string[];
    maxPrice?: number;
    minPrice?: number;
    limit?: number;
    excludeSkus?: string[];
  }
): Promise<ProductRecord[]> {
  const bySku = new Map<string, ProductRecord>();
  const vectorScores = new Map<string, number>();

  for (const p of cacheHits) {
    bySku.set(p.sku, p);
  }
  for (const h of vectorHits) {
    const sku = String(h.chunk.metadata.sku ?? h.chunk.id);
    vectorScores.set(sku, h.score);
    if (bySku.has(sku)) continue;
    const cached = await getProductBySku(tenantId, sku, config);
    bySku.set(
      sku,
      cached ?? {
        sku,
        name: h.chunk.metadata.title ?? "Product",
        description: h.chunk.text.slice(0, 500),
        price: h.chunk.metadata.price ?? 0,
        currency: h.chunk.metadata.currency ?? storeCurrency,
        inStock: h.chunk.metadata.inStock ?? true,
        category: h.chunk.metadata.section,
        categories: h.chunk.metadata.categories,
        productUrl: h.chunk.metadata.url,
        tags: h.chunk.metadata.tags?.join(", "),
        material: h.chunk.metadata.material?.join(", "),
        occasion: h.chunk.metadata.occasion?.join(", "),
        recipient: h.chunk.metadata.recipient?.join(", "),
        compatibility: h.chunk.metadata.compatibility?.join(", "),
        bundles: h.chunk.metadata.bundles?.join(", "),
      }
    );
  }

  return rankProductsByRelevance([...bySku.values()], query, {
    ...options,
    vectorScores,
    limit: options?.limit ?? 5,
  });
}

function productDto(
  p: ProductRecord,
  options?: { query?: string; category?: string; maxPrice?: number; minPrice?: number; vectorScore?: number }
) {
  return {
    sku: p.sku,
    name: p.name,
    description: p.description,
    price: p.price,
    currency: p.currency,
    category: p.category,
    categories: p.categories,
    inStock: p.inStock,
    imageUrl: p.imageUrl,
    imageUrls: p.imageUrls,
    url: p.productUrl,
    variants: p.variants,
    material: p.material,
    occasion: p.occasion,
    recipient: p.recipient,
    compatibility: p.compatibility,
    bundles: p.bundles,
    matchReasons: options?.query
      ? productMatchReasons(p, options.query, {
          category: options.category,
          maxPrice: options.maxPrice,
          minPrice: options.minPrice,
          vectorScore: options.vectorScore,
        })
      : undefined,
  };
}

export interface ToolExecutionContext {
  auth: AuthContext;
  config: CoreConfig;
  conversationId: string;
  checkoutBaseUrl?: string;
  channel?: string;
  externalUserId?: string;
  qualification?: QualificationState;
  catalogHints?: CatalogSearchHints;
  pageUrl?: string;
  excludeSkus?: string[];
}

const BROAD_FOCUSED_TERMS = new Set([
  "decor",
  "decoration",
  "decorative",
  "gift",
  "gifting",
  "home decor",
  "event",
  "personal use",
  "display",
  "collectible",
]);

function focusedPreferenceTerms(qualification?: QualificationState, catalogHints?: CatalogSearchHints): string[] {
  const focusedHints = [
    ...(catalogHints?.materials ?? []),
    ...(catalogHints?.occasions ?? []),
    ...(catalogHints?.styles ?? []),
    ...(catalogHints?.useCases ?? []).filter((term) => !BROAD_FOCUSED_TERMS.has(term.trim().toLowerCase())),
  ];
  const focused = new Map(focusedHints.map((term) => [term.toLowerCase(), term]));
  return [
    ...new Set(
      (qualification?.constraints ?? [])
        .map((constraint) => focused.get(constraint.trim().toLowerCase()))
        .filter((term): term is string => Boolean(term))
    ),
  ];
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
      const categoryFilter =
        (args.category ? String(args.category) : undefined) ?? ctx.qualification?.category;
      const maxPrice = (args.maxPrice as number | undefined) ?? ctx.qualification?.budget?.max;
      const minPrice = (args.minPrice as number | undefined) ?? ctx.qualification?.budget?.min;
      const requiredTerms = focusedPreferenceTerms(ctx.qualification, ctx.catalogHints);
      const explicitExcludeSkus = Array.isArray(args.excludeSkus)
        ? args.excludeSkus.map((sku) => String(sku).trim()).filter(Boolean)
        : [];
      const excludeSkus = [...new Set([...(ctx.excludeSkus ?? []), ...explicitExcludeSkus])];
      const searchQuery = buildProductSearchQuery({
        message: query,
        qualification: {
          ...(ctx.qualification ?? {}),
          category: categoryFilter,
          budget: { ...ctx.qualification?.budget, max: maxPrice, min: minPrice },
        },
        pageUrl: ctx.pageUrl,
      });
      const recallLimit = Math.max(limit * 3, 12);
      const storeCurrency = await getStoreCurrency(ctx.auth.tenantId, ctx.config);
      const [vectorHits, cacheHits] = await Promise.all([
        retrieveKnowledge(ctx.auth, searchQuery, ctx.config, {
          topK: recallLimit,
          sourceType: "catalog",
        }),
        searchProductCache(ctx.auth.tenantId, searchQuery, ctx.config, {
          category: categoryFilter,
          requiredTerms,
          maxPrice,
          minPrice,
          excludeSkus,
          limit: recallLimit,
        }),
      ]);
      const ranked = await mergeProductSearchResults(
        ctx.auth.tenantId,
        vectorHits,
        cacheHits,
        ctx.config,
        storeCurrency,
        searchQuery,
        { category: categoryFilter, requiredTerms, maxPrice, minPrice, excludeSkus, limit }
      );
      const vectorScores = new Map(
        vectorHits.map((hit) => [String(hit.chunk.metadata.sku ?? hit.chunk.id), hit.score])
      );
      return {
        success: true,
        result: {
          query: searchQuery,
          products: ranked.map((p) =>
            productDto(p, {
              query: searchQuery,
              category: categoryFilter,
              maxPrice,
              minPrice,
              vectorScore: vectorScores.get(p.sku),
            })
          ),
          totalFound: ranked.length,
        },
      };
    }
    case "compare_products": {
      const rawSkus = args.skus;
      const skus = Array.isArray(rawSkus)
        ? rawSkus.map((s) => String(s).trim()).filter(Boolean)
        : [];
      if (skus.length < 2) {
        return { result: { error: "Provide at least 2 SKUs to compare" }, success: false };
      }
      const loaded = await Promise.all(
        skus.slice(0, 4).map((sku) => getProductBySku(ctx.auth.tenantId, sku, ctx.config))
      );
      const products = loaded.filter((p): p is ProductRecord => p != null);
      if (products.length < 2) {
        return { result: { error: "Could not find enough products to compare" }, success: false };
      }
      return {
        success: true,
        result: {
          products: products.map((p) => productDto(p)),
          comparedSkus: products.map((p) => p.sku),
        },
      };
    }
    case "get_related_products": {
      const limit = Number(args.limit ?? 5);
      const related = await getRelatedProducts(ctx.auth.tenantId, ctx.config, {
        sku: args.sku ? String(args.sku) : undefined,
        category: args.category ? String(args.category) : undefined,
        limit,
      });
      return {
        success: true,
        result: {
          products: related.map((p) => productDto(p)),
          totalFound: related.length,
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
      const realCheckout = await createCommerceCheckout(ctx.auth, ctx.config, cart, {
        channel: ctx.channel,
        externalUserId: ctx.externalUserId,
      });
      if (realCheckout) {
        const updatedCart =
          (await recordCartCheckout(
            ctx.auth.tenantId,
            ctx.conversationId,
            {
              checkoutUrl: realCheckout.checkoutUrl,
              checkoutProvider: realCheckout.provider,
              checkoutExternalId: realCheckout.externalCheckoutId,
            },
            ctx.config
          )) ?? cart;
        return {
          success: true,
          result: {
            checkoutUrl: realCheckout.checkoutUrl,
            provider: realCheckout.provider,
            externalCheckoutId: realCheckout.externalCheckoutId,
            cart: updatedCart,
          },
        };
      }
      const base = ctx.checkoutBaseUrl || "https://checkout.commercechat.com";
      const url = `${base}/${ctx.auth.tenantId}/${cart.cartId}`;
      const updatedCart =
        (await recordCartCheckout(
          ctx.auth.tenantId,
          ctx.conversationId,
          {
            checkoutUrl: url,
            checkoutProvider: "fallback",
            checkoutExternalId: cart.cartId,
          },
          ctx.config
        )) ?? cart;
      return { success: true, result: { checkoutUrl: url, provider: "fallback", cart: updatedCart } };
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
