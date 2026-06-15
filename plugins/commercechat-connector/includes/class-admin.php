<?php

if (!defined('ABSPATH')) {
    exit;
}

class CommerceChat_Connector_Admin
{
    private const PAGE_SLUG = 'commercechat-connector';

    public static function init(): void
    {
        add_action('admin_menu', [self::class, 'menu']);
        add_action('admin_init', [self::class, 'register_settings']);
        add_filter('plugin_action_links_' . plugin_basename(COMMERCECHAT_CONNECTOR_PATH . 'commercechat-connector.php'), [self::class, 'plugin_action_links']);
        add_action('admin_notices', [self::class, 'missing_key_notice']);
    }

    public static function settings_url(bool $generate = false): string
    {
        $url = admin_url('options-general.php?page=' . self::PAGE_SLUG);
        if ($generate) {
            $url = wp_nonce_url(add_query_arg('commercechat_generate', '1', $url), 'commercechat_generate_key');
        }
        return $url;
    }

    /** @param array<string, string> $links */
    public static function plugin_action_links(array $links): array
    {
        $api_key = get_option('commercechat_api_key', '');
        $shortcuts = [
            '<a href="' . esc_url(self::settings_url()) . '">' . esc_html__('Settings', 'commercechat-connector') . '</a>',
        ];
        if ($api_key === '') {
            $shortcuts[] = '<a href="' . esc_url(self::settings_url(true)) . '"><strong>' . esc_html__('Generate API key', 'commercechat-connector') . '</strong></a>';
        } else {
            $shortcuts[] = '<a href="' . esc_url(self::settings_url(true)) . '">' . esc_html__('Regenerate API key', 'commercechat-connector') . '</a>';
        }
        return array_merge($shortcuts, $links);
    }

    public static function missing_key_notice(): void
    {
        if (!current_user_can('manage_options') || get_option('commercechat_api_key', '') !== '') {
            return;
        }
        $screen = function_exists('get_current_screen') ? get_current_screen() : null;
        if ($screen && $screen->id === 'settings_page_' . self::PAGE_SLUG) {
            return;
        }
        echo '<div class="notice notice-warning"><p>';
        echo esc_html__('CommerceChat Connector needs an API key before CommerceChat can sync products or look up orders.', 'commercechat-connector');
        echo ' <a class="button button-primary" href="' . esc_url(self::settings_url(true)) . '">';
        echo esc_html__('Generate API key', 'commercechat-connector');
        echo '</a></p></div>';
    }

    public static function menu(): void
    {
        add_options_page(
            'CommerceChat',
            'CommerceChat',
            'manage_options',
            self::PAGE_SLUG,
            [self::class, 'render_page']
        );

        add_submenu_page(
            'woocommerce',
            'CommerceChat',
            'CommerceChat',
            'manage_options',
            self::PAGE_SLUG,
            [self::class, 'render_page']
        );
    }

    public static function register_settings(): void
    {
        register_setting('commercechat_connector', 'commercechat_api_key', [
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
        ]);
        register_setting('commercechat_connector', 'commercechat_cloud_api_url', [
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
        ]);
        register_setting('commercechat_connector', 'commercechat_widget_enabled', [
            'type' => 'string',
            'sanitize_callback' => static function ($value) {
                return $value === '1' ? '1' : '0';
            },
        ]);
        register_setting('commercechat_connector', 'commercechat_widget_script_url', [
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
        ]);
    }

    private static function generate_api_key(): string
    {
        $key = 'cc_wp_' . bin2hex(random_bytes(24));
        update_option('commercechat_api_key', $key);
        return $key;
    }

    public static function render_page(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }

        $generated = false;
        if (
            (isset($_POST['commercechat_generate_key']) && check_admin_referer('commercechat_generate_key'))
            || (isset($_GET['commercechat_generate']) && wp_verify_nonce(sanitize_text_field(wp_unslash($_GET['_wpnonce'] ?? '')), 'commercechat_generate_key'))
        ) {
            self::generate_api_key();
            $generated = true;
        }

        $api_key = get_option('commercechat_api_key', '');
        $cloud_url = get_option('commercechat_cloud_api_url', '');
        $widget_on = get_option('commercechat_widget_enabled', '1') === '1';
        $rest_base = rest_url(CommerceChat_Connector_REST_API::NAMESPACE);
        ?>
        <div class="wrap">
            <h1>CommerceChat Connector</h1>
            <p>Connect this WooCommerce store to <strong>CommerceChat</strong> for product sync, order lookups, and the web chat widget — using <strong>one API key</strong>.</p>

            <?php if ($generated) : ?>
                <div class="notice notice-success is-dismissible"><p><?php esc_html_e('New API key generated. Copy it into CommerceChat Admin → Knowledge → WooCommerce.', 'commercechat-connector'); ?></p></div>
            <?php elseif ($api_key === '') : ?>
                <div class="notice notice-warning"><p>
                    <?php esc_html_e('No API key yet.', 'commercechat-connector'); ?>
                    <a class="button button-primary" href="<?php echo esc_url(self::settings_url(true)); ?>"><?php esc_html_e('Generate API key', 'commercechat-connector'); ?></a>
                </p></div>
            <?php endif; ?>

            <?php if ($widget_on && $api_key !== '' && $cloud_url === '') : ?>
                <div class="notice notice-warning"><p>
                    <?php esc_html_e('Widget is enabled but CommerceChat API URL is missing. Enter the full URL below (e.g. https://….execute-api.us-east-1.amazonaws.com) and click Save, or re-connect WooCommerce in CommerceChat Admin.', 'commercechat-connector'); ?>
                </p></div>
            <?php endif; ?>

            <form method="post" action="options.php">
                <?php settings_fields('commercechat_connector'); ?>
                <table class="form-table">
                    <tr>
                        <th scope="row"><label for="commercechat_api_key"><?php esc_html_e('API key', 'commercechat-connector'); ?></label></th>
                        <td>
                            <?php if ($api_key === '') : ?>
                                <em><?php esc_html_e('Not generated yet.', 'commercechat-connector'); ?></em>
                                <p>
                                    <a class="button button-primary" href="<?php echo esc_url(self::settings_url(true)); ?>"><?php esc_html_e('Generate API key', 'commercechat-connector'); ?></a>
                                </p>
                            <?php else : ?>
                                <input type="text" id="commercechat_api_key" name="commercechat_api_key"
                                       value="<?php echo esc_attr($api_key); ?>" class="regular-text code" readonly
                                       onclick="this.select();" />
                                <button type="button" class="button" onclick="navigator.clipboard.writeText(document.getElementById('commercechat_api_key').value); this.textContent='<?php echo esc_js(__('Copied!', 'commercechat-connector')); ?>';">
                                    <?php esc_html_e('Copy', 'commercechat-connector'); ?>
                                </button>
                            <?php endif; ?>
                            <p class="description"><?php esc_html_e('Paste this key once in CommerceChat Admin when connecting WooCommerce. The same key powers product sync and the storefront chat widget — no separate widget key needed.', 'commercechat-connector'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e('Web chat widget', 'commercechat-connector'); ?></th>
                        <td>
                            <input type="hidden" name="commercechat_widget_enabled" value="0" />
                            <label>
                                <input type="checkbox" name="commercechat_widget_enabled" value="1" <?php checked($widget_on); ?> />
                                <?php esc_html_e('Show CommerceChat widget on storefront (no theme code edits)', 'commercechat-connector'); ?>
                            </label>
                            <p class="description"><?php esc_html_e('When you connect this store in CommerceChat Admin, the API URL is saved automatically. Re-connect if the widget does not appear.', 'commercechat-connector'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="commercechat_cloud_api_url"><?php esc_html_e('CommerceChat API URL', 'commercechat-connector'); ?></label></th>
                        <td>
                            <input type="url" id="commercechat_cloud_api_url" name="commercechat_cloud_api_url"
                                   value="<?php echo esc_attr($cloud_url); ?>" class="regular-text code"
                                   placeholder="https://api.commercechat.com" />
                            <p class="description"><?php esc_html_e('Usually set automatically when you connect in CommerceChat Admin.', 'commercechat-connector'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e('REST base URL', 'commercechat-connector'); ?></th>
                        <td><code><?php echo esc_html($rest_base); ?></code></td>
                    </tr>
                </table>
                <?php if ($api_key !== '') {
                    submit_button(__('Save', 'commercechat-connector'));
                } ?>
            </form>

            <?php if ($api_key !== '') : ?>
                <p>
                    <a class="button" href="<?php echo esc_url(self::settings_url(true)); ?>"><?php esc_html_e('Regenerate API key', 'commercechat-connector'); ?></a>
                </p>
            <?php endif; ?>
        </div>
        <?php
    }
}
