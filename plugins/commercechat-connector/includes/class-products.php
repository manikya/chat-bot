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

        $tags = [];
        foreach ($product->get_tag_ids() as $tag_id) {
            $term = get_term($tag_id, 'product_tag');
            if ($term && !is_wp_error($term)) {
                $tags[] = $term->name;
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
        $images = [];
        if ($image) {
            $images[] = $image;
        }
        foreach ($product->get_gallery_image_ids() as $gallery_image_id) {
            $gallery_url = wp_get_attachment_url($gallery_image_id);
            if ($gallery_url) {
                $images[] = $gallery_url;
            }
        }
        $images = array_values(array_unique($images));

        $short = wp_strip_all_tags($product->get_short_description());
        $desc = wp_strip_all_tags($product->get_description());
        $raw_short = wp_kses_post($product->get_short_description());
        $raw_desc = wp_kses_post($product->get_description());
        $name = $product->get_name();
        $sku = $product->get_sku() ?: 'wc-' . $product->get_id();
        $price = (float) $product->get_price();
        $regular_price = (float) $product->get_regular_price();
        $sale_price = (float) $product->get_sale_price();
        $currency = function_exists('get_woocommerce_currency')
            ? get_woocommerce_currency()
            : 'USD';
        $dimensions = array_filter([
            'length' => $product->get_length(),
            'width' => $product->get_width(),
            'height' => $product->get_height(),
        ]);

        $rag_parts = array_filter([
            $name,
            $product->get_type() ? 'Type: ' . $product->get_type() : null,
            $categories ? 'Categories: ' . implode(', ', $categories) : null,
            $tags ? 'Tags: ' . implode(', ', $tags) : null,
            $short ?: $desc,
            $price > 0 ? $currency . ' ' . number_format($price, 2) : null,
            $regular_price > 0 && $regular_price !== $price ? 'Regular price: ' . $currency . ' ' . number_format($regular_price, 2) : null,
            $sale_price > 0 ? 'Sale price: ' . $currency . ' ' . number_format($sale_price, 2) : null,
            'SKU: ' . $sku,
            $product->get_stock_status() === 'instock' ? 'In stock' : 'Out of stock',
            $product->managing_stock() ? 'Stock quantity: ' . (string) $product->get_stock_quantity() : null,
            $attributes ? 'Attributes: ' . implode('; ', array_map(function ($attr) {
                return $attr['name'] . ': ' . implode(', ', $attr['options']);
            }, $attributes)) : null,
            $product->get_weight() ? 'Weight: ' . $product->get_weight() : null,
            $dimensions ? 'Dimensions: ' . implode(' x ', array_filter($dimensions)) : null,
            $product->get_average_rating() ? 'Average rating: ' . $product->get_average_rating() : null,
            $product->get_review_count() ? 'Review count: ' . $product->get_review_count() : null,
            $product->get_permalink(),
            $images ? 'Images: ' . implode(', ', $images) : null,
        ]);

        return [
            'id' => $product->get_id(),
            'sku' => $sku,
            'name' => $name,
            'type' => $product->get_type(),
            'short_description' => $short,
            'description' => $desc,
            'short_description_html' => $raw_short,
            'description_html' => $raw_desc,
            'price' => $price,
            'regular_price' => $regular_price,
            'sale_price' => $sale_price,
            'currency' => $currency,
            'categories' => $categories,
            'tags' => $tags,
            'attributes' => $attributes,
            'stock_status' => $product->get_stock_status(),
            'stock_quantity' => $product->managing_stock() ? $product->get_stock_quantity() : null,
            'permalink' => $product->get_permalink(),
            'image' => $image,
            'images' => $images,
            'weight' => $product->get_weight(),
            'dimensions' => $dimensions,
            'average_rating' => (float) $product->get_average_rating(),
            'review_count' => (int) $product->get_review_count(),
            'updated_at' => gmdate('c', $product->get_date_modified()->getTimestamp()),
            'rag_text' => implode(' | ', $rag_parts),
        ];
    }
}
