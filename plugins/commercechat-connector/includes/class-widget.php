<?php

if (!defined('ABSPATH')) {
    exit;
}

class CommerceChat_Connector_Widget
{
    public static function init(): void
    {
        add_action('wp_footer', [self::class, 'render'], 99);
    }

    public static function is_enabled(): bool
    {
        return get_option('commercechat_widget_enabled', '1') === '1';
    }

    public static function cloud_api_url(): string
    {
        return rtrim((string) get_option('commercechat_cloud_api_url', ''), '/');
    }

    public static function render(): void
    {
        if (is_admin() || !self::is_enabled()) {
            return;
        }

        $api_key = get_option('commercechat_api_key', '');
        if ($api_key === '') {
            return;
        }

        $cloud = self::cloud_api_url();
        if ($cloud === '') {
            return;
        }

        $script = $cloud . '/widget/v1.js';
        printf(
            '<script src="%s" data-api-key="%s" data-api-url="%s" async></script>' . "\n",
            esc_url($script),
            esc_attr($api_key),
            esc_attr($cloud)
        );
    }
}
