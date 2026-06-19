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
  const locale = code === "LKR" ? "en-LK" : "en";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(price);
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
  const search = result.toolResults?.find((t) =>
    ["search_products", "compare_products", "get_related_products"].includes(t.tool) && t.success
  );
  const products = search?.products as ProductResult[] | undefined;
  return products?.length ? products.slice(0, 3) : [];
}

function stripProductListFromReply(reply: string) {
  let clean = stripMarkdown(reply)
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const markers = [
    "Products I found:",
    "Here are some options:",
    "Want me to add ",
  ];
  for (const marker of markers) {
    const idx = clean.toLowerCase().indexOf(marker.toLowerCase());
    if (idx > 0) {
      clean = clean.slice(0, idx).trim();
    }
  }

  clean = clean
    .split("\n")
    .filter((line) => {
      const l = line.trim();
      if (/^\d+\.\s+/.test(l)) return false;
      if (/^-\s+.+:\s+/.test(l)) return false;
      if (/^•\s+/.test(l)) return false;
      if (/^View:\s+https?:\/\//i.test(l)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return clean;
}

function formatWhatsAppProduct(product: ProductResult, index: number) {
  const title = stripMarkdown(product.name || product.sku || `Product ${index}`);
  const price = formatPrice(product.price, product.currency);
  const stock = product.inStock === false ? "Out of stock" : "In stock";
  const lines = [
    `*${index}. ${title}*`,
    [price, stock, product.sku ? `SKU: ${product.sku}` : undefined].filter(Boolean).join(" | "),
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
  const intro =
    stripProductListFromReply(result.reply.content) ||
    (channel === "whatsapp" ? "I found these options:" : "I found these options:");
  const heading = channel === "whatsapp" ? "*Top matches:*" : "Top matches:";
  const cards = products.map((product, i) => formatter(product, i + 1)).join("\n\n");
  const nextStep =
    channel === "whatsapp"
      ? "\n\nReply with the number or SKU and I'll help add it to your cart."
      : "\n\nTap a card to view or add to cart.";
  const content = `${intro}\n\n${heading}\n${cards}${nextStep}`;
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
