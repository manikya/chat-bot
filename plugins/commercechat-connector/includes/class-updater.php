<?php

if (!defined('ABSPATH')) {
    exit;
}

class CommerceChat_Connector_Updater
{
    private const MANIFEST_SLUG = 'commercechat-connector';

    public static function init(): void
    {
        add_filter('pre_set_site_transient_update_plugins', [self::class, 'check_for_update']);
        add_filter('plugins_api', [self::class, 'plugin_info'], 20, 3);
    }

    private static function plugin_basename(): string
    {
        return plugin_basename(COMMERCECHAT_CONNECTOR_PATH . 'commercechat-connector.php');
    }

  /** @return object|null */
    private static function fetch_manifest(): ?object
    {
        $admin = rtrim((string) get_option('commercechat_admin_url', ''), '/');
        if ($admin === '') {
            return null;
        }

        $cached = get_transient('commercechat_plugin_manifest');
        if (is_object($cached)) {
            return $cached;
        }

        $response = wp_remote_get(
            $admin . '/commercechat-connector.json',
            ['timeout' => 10]
        );

        if (is_wp_error($response) || (int) wp_remote_retrieve_response_code($response) !== 200) {
            return null;
        }

        $body = json_decode(wp_remote_retrieve_body($response));
        if (!is_object($body) || empty($body->version) || empty($body->download_url)) {
            return null;
        }

        set_transient('commercechat_plugin_manifest', $body, 6 * HOUR_IN_SECONDS);
        return $body;
    }

    /** @param object|false $transient */
    public static function check_for_update($transient)
    {
        if (!is_object($transient) || empty($transient->checked)) {
            return $transient;
        }

        $manifest = self::fetch_manifest();
        if (!$manifest) {
            return $transient;
        }

        $plugin_file = self::plugin_basename();
        if (!isset($transient->checked[$plugin_file])) {
            return $transient;
        }

        if (version_compare(COMMERCECHAT_CONNECTOR_VERSION, (string) $manifest->version, '>=')) {
            return $transient;
        }

        $transient->response[$plugin_file] = (object) [
            'slug' => self::MANIFEST_SLUG,
            'plugin' => $plugin_file,
            'new_version' => (string) $manifest->version,
            'url' => isset($manifest->homepage) ? (string) $manifest->homepage : '',
            'package' => (string) $manifest->download_url,
        ];

        return $transient;
    }

    /**
     * @param false|object|array<string, mixed> $result
     * @param string $action
     * @param object $args
     * @return false|object|array<string, mixed>
     */
    public static function plugin_info($result, $action, $args)
    {
        if ($action !== 'plugin_information' || !isset($args->slug) || $args->slug !== self::MANIFEST_SLUG) {
            return $result;
        }

        $manifest = self::fetch_manifest();
        if (!$manifest) {
            return $result;
        }

        return (object) [
            'name' => isset($manifest->name) ? (string) $manifest->name : 'CommerceChat Connector',
            'slug' => self::MANIFEST_SLUG,
            'version' => (string) $manifest->version,
            'author' => '<a href="https://commercechat.com">CommerceChat</a>',
            'homepage' => isset($manifest->homepage) ? (string) $manifest->homepage : '',
            'download_link' => (string) $manifest->download_url,
            'sections' => [
                'description' => isset($manifest->description)
                    ? (string) $manifest->description
                    : 'Connect WooCommerce to CommerceChat.',
                'changelog' => isset($manifest->changelog) ? (string) $manifest->changelog : '',
            ],
            'requires' => isset($manifest->requires) ? (string) $manifest->requires : '6.0',
            'tested' => isset($manifest->tested) ? (string) $manifest->tested : '6.7',
        ];
    }
}
