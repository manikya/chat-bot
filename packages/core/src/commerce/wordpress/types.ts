export interface WordPressCredentials {
  siteUrl: string;
  apiKey: string;
  updatedAt: string;
}

export interface WordPressProduct {
  id: number;
  sku: string;
  name: string;
  short_description: string;
  description: string;
  price: number;
  regular_price: number;
  currency: string;
  categories: string[];
  attributes: Array<{ name: string; options: string[] }>;
  stock_status: string;
  permalink: string;
  image?: string | null;
  updated_at: string;
  rag_text: string;
}

export interface WordPressProductsPage {
  items: WordPressProduct[];
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
}

export interface WordPressOrderLineItem {
  name: string;
  quantity: number;
  total: string;
}

export interface WordPressOrder {
  id: number;
  number: string;
  status: string;
  status_label: string;
  total: string;
  currency: string;
  created_at: string | null;
  line_items: WordPressOrderLineItem[];
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
  shipping: { phone: string };
}

export interface WordPressStatus {
  ok: boolean;
  plugin_version: string;
  woocommerce_version: string | null;
  site_name: string;
  site_url: string;
  currency: string | null;
}

export interface ConnectWordPressBody {
  siteUrl: string;
  apiKey: string;
}
