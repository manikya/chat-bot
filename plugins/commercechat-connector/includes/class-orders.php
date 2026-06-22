<?php

if (!defined('ABSPATH')) {
    exit;
}

class CommerceChat_Connector_Orders
{
    private const LOOKUP_DAYS = 90;

    public static function get_by_id(int $id): ?array
    {
        $order = wc_get_order($id);
        if (!$order) {
            return null;
        }
        return self::format_order($order);
    }

    public static function get_by_phone(string $phone, int $limit = 5): array
    {
        $limit = min(max($limit, 1), 20);

        $orders = wc_get_orders([
            'limit' => 100,
            'orderby' => 'date',
            'order' => 'DESC',
            'date_created' => '>' . (time() - self::LOOKUP_DAYS * DAY_IN_SECONDS),
            'return' => 'objects',
        ]);

        $matched = [];
        foreach ($orders as $order) {
            $billing_phone = $order->get_billing_phone();
            $shipping_phone = $order->get_shipping_phone();
            if (CommerceChat_Connector_Phone::phones_match($phone, $billing_phone)
                || ($shipping_phone && CommerceChat_Connector_Phone::phones_match($phone, $shipping_phone))) {
                $matched[] = self::format_order($order);
                if (count($matched) >= $limit) {
                    break;
                }
            }
        }

        return [
            'phone' => $phone,
            'orders' => $matched,
            'count' => count($matched),
        ];
    }

    public static function create_checkout(array $input): array
    {
        if (!function_exists('wc_create_order')) {
            return ['error' => 'WooCommerce is not available', 'status' => 503];
        }

        $line_items = isset($input['line_items']) && is_array($input['line_items']) ? $input['line_items'] : [];
        if (empty($line_items)) {
            return ['error' => 'line_items are required', 'status' => 400];
        }

        $order = wc_create_order([
            'status' => 'pending',
            'created_via' => 'commercechat',
        ]);
        if (is_wp_error($order)) {
            return ['error' => $order->get_error_message(), 'status' => 500];
        }

        foreach ($line_items as $line_item) {
            $sku = isset($line_item['sku']) ? sanitize_text_field((string) $line_item['sku']) : '';
            $quantity = isset($line_item['quantity']) ? max(1, (int) $line_item['quantity']) : 1;
            if ($sku === '') {
                $order->delete(true);
                return ['error' => 'Each line item requires sku', 'status' => 400];
            }

            $product_id = wc_get_product_id_by_sku($sku);
            if (!$product_id && preg_match('/^wc-(\d+)$/', $sku, $matches)) {
                $product_id = (int) $matches[1];
            }
            $product = $product_id ? wc_get_product($product_id) : null;
            if (!$product) {
                $order->delete(true);
                return ['error' => 'Product not found for SKU ' . $sku, 'status' => 404];
            }
            if (!$product->is_in_stock()) {
                $order->delete(true);
                return ['error' => $product->get_name() . ' is out of stock', 'status' => 409];
            }

            $order->add_product($product, $quantity);
        }

        if (!empty($input['customer_phone'])) {
            $order->set_billing_phone(sanitize_text_field((string) $input['customer_phone']));
        }
        $order->update_meta_data('_commercechat_cart_id', sanitize_text_field((string) ($input['cart_id'] ?? '')));
        $order->update_meta_data('_commercechat_conversation_id', sanitize_text_field((string) ($input['conversation_id'] ?? '')));
        $order->calculate_totals();
        $order->save();

        return [
            'order_id' => $order->get_id(),
            'order_number' => $order->get_order_number(),
            'checkout_url' => $order->get_checkout_payment_url(),
            'status' => $order->get_status(),
            'total' => $order->get_total(),
            'currency' => $order->get_currency(),
        ];
    }

    private static function format_order(WC_Order $order): array
    {
        $line_items = [];
        foreach ($order->get_items() as $item) {
            $line_items[] = [
                'name' => $item->get_name(),
                'quantity' => $item->get_quantity(),
                'total' => $item->get_total(),
            ];
        }

        $status = $order->get_status();
        $labels = wc_get_order_statuses();
        $key = 'wc-' . $status;
        $status_label = $labels[$key] ?? ucfirst($status);

        return [
            'id' => $order->get_id(),
            'number' => $order->get_order_number(),
            'status' => $status,
            'status_label' => $status_label,
            'total' => $order->get_total(),
            'currency' => $order->get_currency(),
            'created_at' => $order->get_date_created() ? $order->get_date_created()->format('c') : null,
            'line_items' => $line_items,
            'billing' => [
                'first_name' => $order->get_billing_first_name(),
                'last_name' => $order->get_billing_last_name(),
                'email' => $order->get_billing_email(),
                'phone' => $order->get_billing_phone(),
            ],
            'shipping' => [
                'phone' => $order->get_shipping_phone(),
            ],
        ];
    }
}
