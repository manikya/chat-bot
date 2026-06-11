=== CommerceChat Connector ===
Contributors: commercechat
Requires at least: 6.0
Requires PHP: 7.4
WC requires at least: 7.0
Stable tag: 0.1.0

Connect WooCommerce to CommerceChat: sync products for AI answers and look up orders by ID or customer phone (WhatsApp).

== Installation ==

1. Upload the `commercechat-connector` folder to `/wp-content/plugins/`
2. Activate the plugin in WordPress
3. Go to Settings → CommerceChat → Generate API key
4. In CommerceChat Admin → Knowledge, enter your store URL and API key, then Sync

== REST API (Bearer token) ==

* GET /wp-json/commercechat/v1/status
* GET /wp-json/commercechat/v1/products?page=1&per_page=50
* GET /wp-json/commercechat/v1/products/{id}
* GET /wp-json/commercechat/v1/orders/{id}
* GET /wp-json/commercechat/v1/orders/by-phone?phone=+94771234567
