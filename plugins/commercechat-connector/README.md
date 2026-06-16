# CommerceChat Connector (WordPress / WooCommerce)

Install this plugin on the merchant's WooCommerce site. CommerceChat pulls products for RAG and looks up orders by ID or customer phone (WhatsApp).

## Setup

1. Copy `commercechat-connector/` to `wp-content/plugins/` and activate.
2. **Settings → CommerceChat** → **Generate new API key** → copy key.
3. In CommerceChat Admin → **Knowledge** → enter store URL + API key → **Connect WooCommerce**.
4. Products sync on connect and **automatically** when you add, edit, or delete products in WooCommerce (plugin v0.2.1+). Use **Sync products** in admin for a full manual refresh.

## API

All routes require `Authorization: Bearer <api_key>`.

| Method | Path |
|--------|------|
| GET | `/wp-json/commercechat/v1/status` |
| GET | `/wp-json/commercechat/v1/products?page=1&per_page=50` |
| GET | `/wp-json/commercechat/v1/products/{id}` |
| GET | `/wp-json/commercechat/v1/orders/{id}` |
| GET | `/wp-json/commercechat/v1/orders/by-phone?phone=+94771234567` |

Phone matching normalizes Sri Lankan and international formats (e.g. `+94`, leading `0`, last 9 digits).
