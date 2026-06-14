import { ApiError, ErrorCodes } from "@commercechat/shared";

export interface CatalogProduct {
  sku: string;
  name: string;
  description: string;
  price: number;
  category: string;
  currency?: string;
  imageUrl?: string;
  imageUrls?: string[];
  sizes?: string;
  colors?: string;
  tags?: string;
  inStock: boolean;
  url?: string;
}

const REQUIRED = ["sku", "name", "description", "price", "category"] as const;

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseBool(value: string | undefined, defaultValue = true): boolean {
  if (!value?.trim()) return defaultValue;
  const v = value.trim().toLowerCase();
  if (["false", "0", "no", "out", "out_of_stock"].includes(v)) return false;
  return true;
}

export function parseCatalogCsv(csvText: string): CatalogProduct[] {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "CSV must include a header row and at least one product", 400);
  }

  const headers = parseCsvLine(lines[0]!).map(normalizeHeader);
  const col = (row: string[], name: string) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (row[idx] ?? "").trim() : "";
  };

  for (const req of REQUIRED) {
    if (!headers.includes(req)) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, `CSV missing required column: ${req}`, 400);
    }
  }

  const products: CatalogProduct[] = [];
  const seenSkus = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]!);
    const sku = col(row, "sku");
    const name = col(row, "name");
    if (!sku && !name) continue;

    if (!sku || !name) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, `Row ${i + 1}: sku and name are required`, 400);
    }
    if (seenSkus.has(sku)) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, `Row ${i + 1}: duplicate SKU ${sku}`, 400);
    }
    seenSkus.add(sku);

    const priceRaw = col(row, "price").replace(/[$,]/g, "");
    const price = Number(priceRaw);
    if (!Number.isFinite(price) || price < 0) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, `Row ${i + 1}: invalid price`, 400);
    }

    const description = col(row, "description");
    const category = col(row, "category");
    if (!description || !category) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, `Row ${i + 1}: description and category are required`, 400);
    }

    products.push({
      sku,
      name,
      description,
      price,
      category,
      imageUrl: col(row, "image_url") || col(row, "imageurl") || undefined,
      sizes: col(row, "sizes") || undefined,
      colors: col(row, "colors") || undefined,
      inStock: parseBool(col(row, "stock") || col(row, "in_stock")),
      url: col(row, "url") || undefined,
    });
  }

  if (products.length === 0) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "No valid product rows found in CSV", 400);
  }

  return products;
}
