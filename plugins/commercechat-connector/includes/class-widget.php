<?php

if (!defined('ABSPATH')) {
    exit;
}

class CommerceChat_Connector_Widget
{
    private const BOOTSTRAP_TRANSIENT = 'commercechat_bootstrap_v2';

    public static function init(): void
    {
        add_action('wp_footer', [self::class, 'render'], 99);
    }

    public static function cloud_api_url(): string
    {
        return rtrim((string) get_option('commercechat_cloud_api_url', ''), '/');
    }

    /** CDN or API script base (…/widget/v1.js), set by CommerceChat on connect. */
    public static function widget_script_base(): string
    {
        $stored = (string) get_option('commercechat_widget_script_url', '');
        if ($stored !== '') {
            return untrailingslashit($stored);
        }

        $cloud = self::cloud_api_url();
        return $cloud !== '' ? $cloud . '/widget/v1.js' : '';
    }

    /** Build full script src with api_key + api_url (required when script is served from CDN). */
    public static function build_script_src(): string
    {
        $api_key = (string) get_option('commercechat_api_key', '');
        $cloud = self::cloud_api_url();
        $base = self::widget_script_base();
        if ($api_key === '' || $cloud === '' || $base === '') {
            return '';
        }

        return add_query_arg(
            [
                'api_key' => $api_key,
                'api_url' => $cloud,
                'v' => '4',
            ],
            $base
        );
    }

    /**
     * Widget on/off is controlled in CommerceChat Admin (same as Shopify).
     * register-cloud pushes the flag; bootstrap confirms it on the storefront.
     */
    public static function is_enabled(): bool
    {
        if (get_option('commercechat_widget_enabled', '1') !== '1') {
            return false;
        }

        $bootstrap = self::get_bootstrap();
        if (is_array($bootstrap) && array_key_exists('enabled', $bootstrap)) {
            return (bool) $bootstrap['enabled'];
        }

        return true;
    }

    /** @return array<string, mixed>|null */
    private static function get_bootstrap(): ?array
    {
        $cached = get_transient(self::BOOTSTRAP_TRANSIENT);
        if (is_array($cached)) {
            return $cached;
        }

        $cloud = self::cloud_api_url();
        $api_key = (string) get_option('commercechat_api_key', '');
        if ($cloud === '' || $api_key === '') {
            return null;
        }

        $response = wp_remote_get(
            $cloud . '/api/v1/commerce/wordpress/widget-bootstrap',
            [
                'headers' => ['X-API-Key' => $api_key],
                'timeout' => 8,
            ]
        );

        if (is_wp_error($response) || (int) wp_remote_retrieve_response_code($response) !== 200) {
            return null;
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($body) || !isset($body['data']) || !is_array($body['data'])) {
            return null;
        }

        $data = $body['data'];
        set_transient(self::BOOTSTRAP_TRANSIENT, $data, 5 * MINUTE_IN_SECONDS);

        if (!empty($data['widgetScriptUrl'])) {
            update_option('commercechat_widget_script_url', untrailingslashit((string) $data['widgetScriptUrl']));
        }

        return $data;
    }

    public static function clear_cache(): void
    {
        delete_transient(self::BOOTSTRAP_TRANSIENT);
        delete_transient('commercechat_bootstrap_script_url');
    }

    public static function render(): void
    {
        if (is_admin() || !self::is_enabled()) {
            return;
        }

        $src = self::build_script_src();
        if ($src === '') {
            return;
        }

        printf('<script src="%s" async></script>' . "\n", esc_url($src));
    }
}
