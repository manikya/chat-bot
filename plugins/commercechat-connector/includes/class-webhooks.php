<?php

if (!defined('ABSPATH')) {
    exit;
}

class CommerceChat_Connector_Webhooks
{
    private const CRON_HOOK = 'commercechat_catalog_sync';
    private const DEBOUNCE_SEC = 30;

    public static function init(): void
    {
        add_action('woocommerce_update_product', [self::class, 'on_product_change'], 20, 1);
        add_action('woocommerce_new_product', [self::class, 'on_product_change'], 20, 1);
        add_action('woocommerce_delete_product', [self::class, 'on_product_change'], 20, 1);
        add_action('woocommerce_trash_product', [self::class, 'on_product_change'], 20, 1);
        add_action('woocommerce_restore_product', [self::class, 'on_product_change'], 20, 1);
        add_action(self::CRON_HOOK, [self::class, 'push_catalog_sync']);
    }

    public static function on_product_change($product_id): void
    {
        if (!get_option('commercechat_api_key', '')) {
            return;
        }
        self::schedule_sync();
    }

    private static function schedule_sync(): void
    {
        if (wp_next_scheduled(self::CRON_HOOK)) {
            return;
        }
        wp_schedule_single_event(time() + self::DEBOUNCE_SEC, self::CRON_HOOK);
    }

    public static function push_catalog_sync(): void
    {
        $api_key = get_option('commercechat_api_key', '');
        $api_url = rtrim((string) get_option('commercechat_cloud_api_url', ''), '/');
        if ($api_key === '' || $api_url === '') {
            return;
        }

        wp_remote_post(
            $api_url . '/webhooks/commerce/woocommerce',
            [
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-API-Key' => $api_key,
                ],
                'body' => wp_json_encode(['topic' => 'product.changed']),
                'timeout' => 15,
                'blocking' => false,
            ]
        );
    }
}
