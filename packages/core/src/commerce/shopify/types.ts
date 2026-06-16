export interface ShopifyCredentials {
  shopDomain: string;
  accessToken: string;
  /** pk_live_ key used in storefront ScriptTag (set when connecting via Shopify app). */
  widgetApiKey?: string;
  updatedAt: string;
}

export interface ConnectShopifyBody {
  shopDomain: string;
  accessToken: string;
}

export interface ShopifyShopStatus {
  name: string;
  domain: string;
  currency: string;
  plan_name?: string;
}

export interface ShopifyProductVariant {
  id: number;
  sku: string | null;
  price: string;
  inventory_quantity?: number;
  available?: boolean;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string;
  handle: string;
  status: string;
  image?: { src: string } | null;
  images?: Array<{ src: string }>;
  variants: ShopifyProductVariant[];
  updated_at: string;
}

export interface ShopifyProductsPage {
  products: ShopifyProduct[];
}
