import type { ChatResult } from "@commercechat/shared";
import type { MessengerGenericElement } from "../channels/meta-client";
import { stripMarkdown } from "../chat/text-format";

type ProductResult = {
  sku?: string;
  name?: string;
  description?: string;
  price?: number;
  currency?: string;
  inStock?: boolean;
  imageUrl?: string;
  imageUrls?: string[];
  url?: string;
};

function formatPrice(price?: number, currency?: string) {
  if (price == null || !Number.isFinite(price)) return undefined;
  const code = currency || "USD";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code }).format(price);
  } catch {
    return `${code} ${price}`;
  }
}

function truncate(text: string | undefined, max: number) {
  if (!text) return undefined;
  const clean = stripMarkdown(text).replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}...`;
}

export function productResults(result: ChatResult): ProductResult[] {
  const search = result.toolResults?.find((t) => t.tool === "search_products" && t.success);
  const products = search?.products as ProductResult[] | undefined;
  return products?.length ? products.slice(0, 3) : [];
}

function formatWhatsAppProduct(product: ProductResult, index: number) {
  const title = stripMarkdown(product.name || product.sku || `Product ${index}`);
  const price = formatPrice(product.price, product.currency);
  const stock = product.inStock === false ? "Out of stock" : "In stock";
  const lines = [
    `*${index}. ${title}*`,
    [price, stock, product.sku ? `SKU: ${product.sku}` : undefined].filter(Boolean).join(" | "),
    truncate(product.description, 120),
    product.url ? `View: ${product.url}` : undefined,
  ].filter(Boolean);
  return lines.join("\n");
}

function formatMessengerProduct(product: ProductResult, index: number) {
  const title = stripMarkdown(product.name || product.sku || `Product ${index}`);
  const price = formatPrice(product.price, product.currency);
  const stock = product.inStock === false ? "Out of stock" : "In stock";
  const lines = [
    `${index}. ${title}`,
    [price, stock, product.sku ? `SKU: ${product.sku}` : undefined].filter(Boolean).join(" | "),
    truncate(product.description, 120),
    product.url ? `View: ${product.url}` : undefined,
  ].filter(Boolean);
  return lines.join("\n");
}

export function formatProductCardsForChannel(
  result: ChatResult,
  channel: "whatsapp" | "messenger"
) {
  const products = productResults(result);
  if (!products.length) return result.reply.content;

  const formatter = channel === "whatsapp" ? formatWhatsAppProduct : formatMessengerProduct;
  const heading = channel === "whatsapp" ? "*Products I found:*" : "Products I found:";
  const cards = products.map((product, i) => formatter(product, i + 1)).join("\n\n");
  const content = `${result.reply.content.trim()}\n\n${heading}\n${cards}`;
  return channel === "messenger" ? stripMarkdown(content) : content;
}

export function buildMessengerProductElements(result: ChatResult): MessengerGenericElement[] {
  return productResults(result).map((product) => {
    const title = stripMarkdown(product.name || product.sku || "Product");
    const price = formatPrice(product.price, product.currency);
    const stock = product.inStock === false ? "Out of stock" : "In stock";
    const subtitle = [price, stock, product.sku ? `SKU: ${product.sku}` : undefined]
      .filter(Boolean)
      .join(" | ");
    const imageUrl =
      product.imageUrl || (product.imageUrls?.length ? product.imageUrls[0] : undefined);
    const buttons: MessengerGenericElement["buttons"] = [];
    if (product.url) {
      buttons.push({ type: "web_url", title: "View product", url: product.url });
    }
    if (product.sku && product.inStock !== false) {
      buttons.push({
        type: "postback",
        title: "Add to cart",
        payload: `Add ${product.sku} to my cart`,
      });
    }

    return {
      title,
      subtitle: subtitle || truncate(product.description, 80),
      imageUrl,
      defaultActionUrl: product.url,
      buttons,
    };
  });
}
