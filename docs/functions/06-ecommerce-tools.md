# Function Spec: E-commerce Tools

**Parent:** [00-MASTER-ARCHITECTURE.md](../00-MASTER-ARCHITECTURE.md)  
**Version:** 1.0

---

## 1. Purpose

Expose commerce actions as LLM tools so the chatbot can search products, manage carts, generate checkout links, and check order status — identically across all channels.

---

## 2. Tool definitions (JSON Schema)

Shared schema passed to all LLM providers via [04-llm-provider-router.md](04-llm-provider-router.md).

### `search_products`

```json
{
  "name": "search_products",
  "description": "Search the store product catalog by query, category, or price range",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Search terms" },
      "category": { "type": "string" },
      "maxPrice": { "type": "number" },
      "minPrice": { "type": "number" },
      "limit": { "type": "integer", "default": 5 }
    },
    "required": ["query"]
  }
}
```

### `get_product_details`

```json
{
  "name": "get_product_details",
  "parameters": {
    "properties": {
      "sku": { "type": "string" }
    },
    "required": ["sku"]
  }
}
```

### `add_to_cart`

```json
{
  "name": "add_to_cart",
  "parameters": {
    "properties": {
      "sku": { "type": "string" },
      "quantity": { "type": "integer", "default": 1 },
      "variant": { "type": "string", "description": "Size, color, etc." }
    },
    "required": ["sku", "quantity"]
  }
}
```

### `get_cart`

```json
{
  "name": "get_cart",
  "parameters": { "properties": {}, "required": [] }
}
```

### `create_checkout_link`

```json
{
  "name": "create_checkout_link",
  "parameters": {
    "properties": {
      "confirmWithCustomer": { "type": "boolean", "default": true }
    }
  }
}
```

### `get_order_status`

```json
{
  "name": "get_order_status",
  "parameters": {
    "properties": {
      "orderId": { "type": "string" },
      "email": { "type": "string" }
    },
    "required": ["orderId"]
  }
}
```

---

## 3. Cart model

### DynamoDB

| PK | SK | Attributes |
|----|-----|------------|
| `TENANT#<id>` | `CART#<conversationId>` | items[], subtotal, currency, updatedAt |

### Cart object

```json
{
  "cartId": "cart_xyz",
  "conversationId": "conv_abc",
  "tenantId": "ten_123",
  "items": [
    {
      "sku": "SHOE-BLU-9",
      "name": "Blue Runner Sneaker",
      "quantity": 1,
      "unitPrice": 89.99,
      "variant": "Size 9"
    }
  ],
  "subtotal": 89.99,
  "currency": "USD",
  "checkoutUrl": null,
  "updatedAt": "2026-06-06T12:05:00Z"
}
```

**TTL:** Carts expire after 7 days of inactivity.

---

## 4. Tool implementation

### `search_products`

| Step | Action |
|------|--------|
| 1 | Query S3 Vectors with `source_type=catalog` filter |
| 2 | Supplement with DynamoDB product table if connector synced |
| 3 | Apply price/category filters |
| 4 | Return top N products with sku, name, price, image_url, in_stock |

**Response to LLM:**
```json
{
  "products": [
    {
      "sku": "SHOE-BLU-9",
      "name": "Blue Runner Sneaker",
      "price": 89.99,
      "inStock": true,
      "url": "https://store.com/products/blue-runner"
    }
  ],
  "totalFound": 3
}
```

### `add_to_cart`

| Step | Action |
|------|--------|
| 1 | Validate SKU exists and in stock |
| 2 | Load or create cart for conversationId |
| 3 | Merge or add line item |
| 4 | Recalculate subtotal |
| 5 | Persist to DynamoDB |

### `create_checkout_link`

| Connector | Checkout URL generation |
|-----------|------------------------|
| `manual` | Platform-hosted checkout page with cart token |
| `shopify` (Phase 3) | Shopify Draft Order or cart permalink API |
| `woocommerce` (Phase 3) | WooCommerce cart URL API |

**Manual connector flow:**
```
https://checkout.commercechat.com/<tenantId>/<cartToken>
→ Redirect to merchant payment page or show order summary
```

### `get_order_status`

| Connector | Lookup |
|-----------|--------|
| `manual` | DynamoDB orders table (merchant enters orders manually in admin) |
| `shopify` | Shopify Admin API |
| `woocommerce` | WooCommerce REST API |

---

## 5. Commerce connector abstraction

```typescript
interface CommerceConnector {
  searchProducts(params: SearchParams): Promise<Product[]>;
  getProduct(sku: string): Promise<Product>;
  checkStock(sku: string): Promise<boolean>;
  createCheckoutLink(cart: Cart): Promise<string>;
  getOrderStatus(orderId: string, email?: string): Promise<OrderStatus>;
}
```

### Implementations

| Type | Class | Phase |
|------|-------|-------|
| CSV / manual | `ManualConnector` | MVP |
| Shopify | `ShopifyConnector` | **Shipped** (OAuth app + manual token) |
| WooCommerce | `WooCommerceConnector` | **Shipped** (WordPress plugin + product webhooks) |

Connector selected from `tenant.commerceConnector.type`.

### Shopify (shipped)

| Piece | Location |
|-------|----------|
| Core sync + credentials | `packages/core/src/commerce/shopify/` |
| ScriptTag install/remove | `packages/core/src/commerce/shopify/widget-script.ts` |
| Catalog webhook debounce | `packages/core/src/commerce/catalog-sync-trigger.ts` |
| Commerce APIs | `apps/api/src/handlers/commerce-shopify.ts` |
| Partner OAuth app | `apps/api/src/shopify-app/` → Lambda `shopify-app` |
| Admin UI | `ShopifyConnectCard` — widget toggle, API key panel, sync/disconnect |
| Self-hosted fallback | `plugins/shopify-app/` zip in `apps/admin/public/` |

Merchant flow: copy `pk_live_…` in admin → install `{API}/shopify-app/auth?shop=…` → paste key in app → widget ScriptTag installed automatically.

**Widget on/off:** same as WordPress — `widgetConfig.widgetEnabled` toggles Shopify ScriptTags. Control in **Knowledge → Shopify** (admin) or **CommerceChat app** (`/shopify-app/app`).

**Catalog sync:** Shopify `products/create|update|delete` webhooks → `/shopify-app/webhooks` queue debounced ingest. Manual **Sync products** still available.

**Reinstall:** if connect fails with Shopify 401 after reinstalling the app, use **Re-authorize** (`/shopify-app/auth?shop=…&force=1`).

---

## 6. Channel-specific commerce UX

| Channel | Product display | Checkout |
|---------|-----------------|----------|
| WhatsApp | Text list + optional interactive list message | Checkout URL in message; WhatsApp Catalog (Phase 3) |
| Messenger | Text + generic template card (Phase 2) | Checkout URL button |
| Instagram | Text (limited rich UI) | Checkout URL |
| Web | Product cards with images | Inline checkout button |

### WhatsApp interactive list (Phase 2)

```json
{
  "type": "interactive",
  "interactive": {
    "type": "list",
    "body": { "text": "Here are 3 options in your size:" },
    "action": {
      "sections": [{
        "title": "Sneakers",
        "rows": [
          { "id": "sku_SHOE-BLU-9", "title": "Blue Runner", "description": "$89.99" }
        ]
      }]
    }
  }
}
```

---

## 7. Order model

| PK | SK | Attributes |
|----|-----|------------|
| `TENANT#<id>` | `ORDER#<orderId>` | status, items, customerRef, total, createdAt |

### Order statuses

`pending → confirmed → shipped → delivered | cancelled`

---

## 8. Error responses to LLM

| Scenario | Tool response |
|----------|---------------|
| SKU not found | `{ "error": "PRODUCT_NOT_FOUND", "message": "..." }` |
| Out of stock | `{ "error": "OUT_OF_STOCK", "sku": "..." }` |
| Empty cart at checkout | `{ "error": "CART_EMPTY" }` |
| Connector down | `{ "error": "CONNECTOR_UNAVAILABLE" }` |

LLM must explain errors politely to customer.

---

## 9. Security

- Cart scoped to `conversationId` — no cross-user cart access
- Checkout links use signed JWT tokens (1-hour expiry)
- Order lookup requires `orderId` + optional email verification
- No raw payment card data ever handled by platform

---

## 10. Lambda

| Function | Invoked by | Responsibility |
|----------|------------|----------------|
| `tool-executor` | Orchestrator (in-process lib) | Route tool name → handler |
| `checkout-page` | API Gateway | Render/host checkout redirect |
| `commerce-sync` | Webhooks + manual sync | Debounced catalog ingest from Shopify/Woo product change events |

---

## 11. Testing checklist

- [ ] search_products returns relevant results
- [ ] add_to_cart persists across messages
- [ ] create_checkout_link generates valid signed URL
- [ ] Out-of-stock blocks add_to_cart
- [ ] Cart TTL expires after 7 days
- [ ] Order status returns correct state
- [ ] Tools work identically from WhatsApp and web paths
- [ ] Connector abstraction swappable (manual → shopify mock)
