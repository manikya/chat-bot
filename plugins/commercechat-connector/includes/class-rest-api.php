<?php

if (!defined('ABSPATH')) {
    exit;
}

class CommerceChat_Connector_REST_API
{
    public const NAMESPACE = 'commercechat/v1';

    public static function init(): void
    {
        add_action('rest_api_init', [self::class, 'register_routes']);
    }

    public static function register_routes(): void
    {
        register_rest_route(self::NAMESPACE, '/status', [
            'methods' => 'GET',
            'callback' => [self::class, 'status'],
            'permission_callback' => [self::class, 'authorize'],
        ]);

        register_rest_route(self::NAMESPACE, '/products', [
            'methods' => 'GET',
            'callback' => [self::class, 'list_products'],
            'permission_callback' => [self::class, 'authorize'],
        ]);

        register_rest_route(self::NAMESPACE, '/products/(?P<id>\d+)', [
            'methods' => 'GET',
            'callback' => [self::class, 'get_product'],
            'permission_callback' => [self::class, 'authorize'],
        ]);

        register_rest_route(self::NAMESPACE, '/orders/(?P<id>\d+)', [
            'methods' => 'GET',
            'callback' => [self::class, 'get_order'],
            'permission_callback' => [self::class, 'authorize'],
        ]);

        register_rest_route(self::NAMESPACE, '/orders/by-phone', [
            'methods' => 'GET',
            'callback' => [self::class, 'orders_by_phone'],
            'permission_callback' => [self::class, 'authorize'],
        ]);

        register_rest_route(self::NAMESPACE, '/register-cloud', [
            'methods' => 'POST',
            'callback' => [self::class, 'register_cloud'],
            'permission_callback' => [self::class, 'authorize'],
        ]);
    }

    public static function authorize(WP_REST_Request $request): bool
    {
        $stored = get_option('commercechat_api_key', '');
        if ($stored === '') {
            return false;
        }

        $header = $request->get_header('authorization');
        if (!$header || !preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
            return false;
        }

        return hash_equals($stored, trim($m[1]));
    }

    public static function status(): WP_REST_Response
    {
        return new WP_REST_Response([
            'ok' => true,
            'plugin_version' => COMMERCECHAT_CONNECTOR_VERSION,
            'woocommerce_version' => defined('WC_VERSION') ? WC_VERSION : null,
            'site_name' => get_bloginfo('name'),
            'site_url' => home_url(),
            'currency' => function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : null,
        ], 200);
    }

    public static function list_products(WP_REST_Request $request): WP_REST_Response
    {
        $page = (int) $request->get_param('page') ?: 1;
        $per_page = (int) $request->get_param('per_page') ?: 50;
        $since = $request->get_param('since');

        return new WP_REST_Response(
            CommerceChat_Connector_Products::list($page, $per_page, $since ? (string) $since : null),
            200
        );
    }

    public static function get_product(WP_REST_Request $request): WP_REST_Response
    {
        $id = (int) $request->get_param('id');
        $product = CommerceChat_Connector_Products::get_by_id($id);
        if (!$product) {
            return new WP_REST_Response(['error' => 'Product not found'], 404);
        }
        return new WP_REST_Response($product, 200);
    }

    public static function get_order(WP_REST_Request $request): WP_REST_Response
    {
        $id = (int) $request->get_param('id');
        $order = CommerceChat_Connector_Orders::get_by_id($id);
        if (!$order) {
            return new WP_REST_Response(['error' => 'Order not found'], 404);
        }
        return new WP_REST_Response($order, 200);
    }

    public static function orders_by_phone(WP_REST_Request $request): WP_REST_Response
    {
        $phone = (string) $request->get_param('phone');
        if (trim($phone) === '') {
            return new WP_REST_Response(['error' => 'phone is required'], 400);
        }
        $limit = (int) $request->get_param('limit') ?: 5;
        return new WP_REST_Response(CommerceChat_Connector_Orders::get_by_phone($phone, $limit), 200);
    }

    /** CommerceChat calls this on connect — stores API URL so the widget can load without theme edits. */
    public static function register_cloud(WP_REST_Request $request): WP_REST_Response
    {
        $body = $request->get_json_params();
        $url = isset($body['apiPublicUrl']) ? esc_url_raw((string) $body['apiPublicUrl']) : '';
        if ($url === '') {
            return new WP_REST_Response(['error' => 'apiPublicUrl is required'], 400);
        }

        update_option('commercechat_cloud_api_url', untrailingslashit($url));
        update_option('commercechat_widget_enabled', '1');

        $script = isset($body['widgetScriptUrl']) ? esc_url_raw((string) $body['widgetScriptUrl']) : '';
        if ($script !== '') {
            update_option('commercechat_widget_script_url', untrailingslashit($script));
            delete_transient('commercechat_bootstrap_script_url');
        }

        return new WP_REST_Response(['ok' => true], 200);
    }
}
