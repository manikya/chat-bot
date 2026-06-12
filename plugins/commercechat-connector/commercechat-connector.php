<?php
/**
 * Plugin Name: CommerceChat Connector
 * Description: Connect your WooCommerce store to CommerceChat for product sync and order lookups (WhatsApp-friendly phone matching).
 * Version: 0.2.0
 * Author: CommerceChat
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * WC requires at least: 7.0
 */

if (!defined('ABSPATH')) {
    exit;
}

define('COMMERCECHAT_CONNECTOR_VERSION', '0.2.0');
define('COMMERCECHAT_CONNECTOR_PATH', plugin_dir_path(__FILE__));

require_once COMMERCECHAT_CONNECTOR_PATH . 'includes/class-phone.php';
require_once COMMERCECHAT_CONNECTOR_PATH . 'includes/class-products.php';
require_once COMMERCECHAT_CONNECTOR_PATH . 'includes/class-orders.php';
require_once COMMERCECHAT_CONNECTOR_PATH . 'includes/class-rest-api.php';
require_once COMMERCECHAT_CONNECTOR_PATH . 'includes/class-admin.php';
require_once COMMERCECHAT_CONNECTOR_PATH . 'includes/class-widget.php';

add_action('plugins_loaded', function () {
    if (!class_exists('WooCommerce')) {
        add_action('admin_notices', function () {
            echo '<div class="notice notice-warning"><p>CommerceChat Connector requires WooCommerce.</p></div>';
        });
        return;
    }

    CommerceChat_Connector_REST_API::init();
    CommerceChat_Connector_Admin::init();
    CommerceChat_Connector_Widget::init();
});
