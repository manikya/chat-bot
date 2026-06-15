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

    /** CDN script URL from register-cloud, or widget-bootstrap when CDN is enabled. */
    public static function widget_script_url(): string
    {
        $stored = (string) get_option('commercechat_widget_script_url', '');
        if ($stored !== '') {
            return untrailingslashit($stored);
        }

        $cached = get_transient('commercechat_bootstrap_script_url');
        if (is_string($cached) && $cached !== '') {
            return $cached;
        }

        $cloud = self::cloud_api_url();
        $api_key = (string) get_option('commercechat_api_key', '');
        if ($cloud === '' || $api_key === '') {
            return $cloud !== '' ? $cloud . '/widget/v1.js' : '';
        }

        $response = wp_remote_get(
            $cloud . '/api/v1/commerce/wordpress/widget-bootstrap',
            [
                'headers' => ['X-API-Key' => $api_key],
                'timeout' => 8,
            ]
        );

        if (!is_wp_error($response) && (int) wp_remote_retrieve_response_code($response) === 200) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            $script = '';
            if (is_array($body) && isset($body['data']['widgetScriptUrl'])) {
                $script = esc_url_raw((string) $body['data']['widgetScriptUrl']);
            }
            if ($script !== '') {
                $script = untrailingslashit($script);
                set_transient('commercechat_bootstrap_script_url', $script, HOUR_IN_SECONDS);
                return $script;
            }
        }

        return $cloud . '/widget/v1.js';
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

        $script = self::widget_script_url();
        if ($script === '') {
            return;
        }

        printf(
            '<script src="%s" data-api-key="%s" data-api-url="%s" async></script>' . "\n",
            esc_url($script),
            esc_attr($api_key),
            esc_attr($cloud)
        );
    }
}
