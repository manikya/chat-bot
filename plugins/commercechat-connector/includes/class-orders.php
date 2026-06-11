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
