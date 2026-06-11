<?php

if (!defined('ABSPATH')) {
    exit;
}

class CommerceChat_Connector_Products
{
    public static function list(int $page = 1, int $per_page = 50, ?string $since = null): array
    {
        $per_page = min(max($per_page, 1), 100);
        $page = max($page, 1);

        $args = [
            'status' => 'publish',
            'limit' => $per_page,
            'page' => $page,
            'orderby' => 'modified',
            'order' => 'DESC',
            'return' => 'objects',
        ];

        if ($since) {
            $ts = strtotime($since);
            if ($ts) {
                $args['date_modified'] = '>' . gmdate('Y-m-d H:i:s', $ts);
            }
        }

        $products = wc_get_products($args);
        $items = array_map([self::class, 'format_product'], $products);

        return [
            'items' => $items,
            'page' => $page,
            'per_page' => $per_page,
            'total' => count($items) + ($page - 1) * $per_page,
            'has_more' => count($items) === $per_page,
        ];
    }

    public static function get_by_id(int $id): ?array
    {
        $product = wc_get_product($id);
        if (!$product) {
            return null;
        }
        return self::format_product($product);
    }

    private static function format_product(WC_Product $product): array
    {
        $categories = [];
        foreach ($product->get_category_ids() as $cat_id) {
            $term = get_term($cat_id, 'product_cat');
            if ($term && !is_wp_error($term)) {
                $categories[] = $term->name;
            }
        }

        $attributes = [];
        foreach ($product->get_attributes() as $attr) {
            if ($attr->is_taxonomy()) {
                $options = wc_get_product_terms($product->get_id(), $attr->get_name(), ['fields' => 'names']);
            } else {
                $options = $attr->get_options();
            }
            $attributes[] = [
                'name' => wc_attribute_label($attr->get_name()),
                'options' => array_values($options),
            ];
        }

        $image_id = $product->get_image_id();
        $image = $image_id ? wp_get_attachment_url($image_id) : null;

        $short = wp_strip_all_tags($product->get_short_description());
        $desc = wp_strip_all_tags($product->get_description());
        $name = $product->get_name();
        $sku = $product->get_sku() ?: 'wc-' . $product->get_id();
        $price = (float) $product->get_price();
        $currency = function_exists('get_woocommerce_currency')
            ? get_woocommerce_currency()
            : 'USD';

        $rag_parts = array_filter([
            $name,
            implode(', ', $categories),
            $short ?: $desc,
            $price > 0 ? $currency . ' ' . number_format($price, 2) : null,
            'SKU: ' . $sku,
            $product->get_stock_status() === 'instock' ? 'In stock' : 'Out of stock',
        ]);

        return [
            'id' => $product->get_id(),
            'sku' => $sku,
            'name' => $name,
            'short_description' => $short,
            'description' => $desc,
            'price' => $price,
            'regular_price' => (float) $product->get_regular_price(),
            'currency' => $currency,
            'categories' => $categories,
            'attributes' => $attributes,
            'stock_status' => $product->get_stock_status(),
            'permalink' => $product->get_permalink(),
            'image' => $image,
            'updated_at' => gmdate('c', $product->get_date_modified()->getTimestamp()),
            'rag_text' => implode(' | ', $rag_parts),
        ];
    }
}
