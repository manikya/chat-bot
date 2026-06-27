"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Database, PackageSearch, Sparkles, Tags } from "lucide-react";
import { api } from "@/lib/api";
import type { CommerceCatalogData, CommerceProductListItem } from "@/lib/api/http-client";
import { MetricTile, SectionHeader } from "@/components/layout/admin-page";
import { AdminPageSkeleton } from "@/components/layout/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function productHref(sku: string) {
  return `/products/${encodeURIComponent(sku)}`;
}

export function formatProductPrice(price: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(currency === "LKR" ? "en-LK" : "en", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${Math.round(price)}`;
  }
}

export function listText(values?: string[], max = 3) {
  const clean = (values ?? []).filter(Boolean);
  if (!clean.length) return "—";
  const shown = clean.slice(0, max).join(", ");
  return clean.length > max ? `${shown} +${clean.length - max}` : shown;
}

function priceCoverageText(coverage?: { min?: number; max?: number; currency: string; inStockCount: number }) {
  if (!coverage || coverage.min == null) return "No price coverage";
  const min = formatProductPrice(coverage.min, coverage.currency);
  const max = coverage.max != null && coverage.max !== coverage.min ? `-${formatProductPrice(coverage.max, coverage.currency)}` : "";
  return `${min}${max} · ${coverage.inStockCount} in stock`;
}

export function DataChips({ values, empty = "No data collected yet" }: { values?: string[]; empty?: string }) {
  const clean = (values ?? []).filter(Boolean);
  if (!clean.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {clean.slice(0, 32).map((value) => (
        <Badge key={value} variant="secondary" className="max-w-full truncate">
          {value}
        </Badge>
      ))}
      {clean.length > 32 && <Badge variant="outline">+{clean.length - 32} more</Badge>}
    </div>
  );
}

export function useProductCatalog(params?: { q?: string; limit?: number }) {
  const [data, setData] = useState<CommerceCatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (override?: { q?: string; limit?: number }) => {
    setError(null);
    const res = await api.commerce.listProducts({
      q: override?.q ?? params?.q,
      limit: override?.limit ?? params?.limit ?? 300,
    });
    setData(res.data);
  };

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load products"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading, error, reload: load, setData };
}

export function ProductCatalogTabs() {
  const pathname = usePathname();
  const items = [
    { href: "/products", label: "Overview" },
    { href: "/products/list", label: "Product list" },
    { href: "/products/categories", label: "Categories" },
    { href: "/products/generated", label: "Generated data" },
  ];

  return (
    <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-white p-1">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Button key={item.href} asChild variant={active ? "default" : "ghost"} size="sm">
            <Link href={item.href}>{item.label}</Link>
          </Button>
        );
      })}
    </div>
  );
}

export function CatalogMetrics({ data }: { data: CommerceCatalogData | null }) {
  const products = data?.items ?? [];
  const generated = data?.generated;
  const inStockCount = products.filter((product) => product.inStock !== false).length;
  const attributeCount = [
    generated?.tags,
    generated?.materials,
    generated?.occasions,
    generated?.recipients,
    generated?.useCases,
    generated?.styles,
  ].reduce((sum, values) => sum + (values?.length ?? 0), 0);
  const relationshipGroups =
    Object.keys(generated?.relatedByCategory ?? {}).length + Object.keys(generated?.occasionRecipients ?? {}).length;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricTile
        label="Products"
        value={(data?.total ?? products.length).toLocaleString()}
        detail={`${inStockCount.toLocaleString()} shown in stock`}
        icon={<PackageSearch className="h-4 w-4" />}
      />
      <MetricTile
        label="Categories"
        value={(data?.categories?.length ?? 0).toLocaleString()}
        detail="from synced catalog taxonomy"
        icon={<Tags className="h-4 w-4" />}
      />
      <MetricTile
        label="Generated Attributes"
        value={attributeCount.toLocaleString()}
        detail="tags, materials, occasions, recipients"
        icon={<Sparkles className="h-4 w-4" />}
      />
      <MetricTile
        label="Sources"
        value={(data?.sources?.length ?? 0).toLocaleString()}
        detail={`${relationshipGroups} relationship groups`}
        icon={<Database className="h-4 w-4" />}
      />
    </div>
  );
}

export function ProductTable({ products, compact = false }: { products: CommerceProductListItem[]; compact?: boolean }) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Price</TableHead>
              {!compact && <TableHead>Categories</TableHead>}
              {!compact && <TableHead>Attributes</TableHead>}
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={compact ? 3 : 5} className="py-10 text-center text-muted-foreground">
                  No products found. Sync a commerce connector or upload a catalog from Knowledge.
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.sku}>
                  <TableCell>
                    <Link href={productHref(product.sku)} className="block min-w-[220px] rounded-md hover:text-primary">
                      <div className="font-medium">{product.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-mono">{product.sku}</span>
                        {product.sourceId && <span>Source {product.sourceId}</span>}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{formatProductPrice(product.price, product.currency)}</TableCell>
                  {!compact && <TableCell className="max-w-[220px] text-sm text-muted-foreground">{listText(product.categories)}</TableCell>}
                  {!compact && (
                    <TableCell className="max-w-[300px] text-sm text-muted-foreground">
                      {listText([
                        ...(product.tags ?? []),
                        ...(product.material ?? []),
                        ...(product.occasion ?? []),
                        ...(product.recipient ?? []),
                      ])}
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant={product.inStock === false ? "warning" : "success"}>
                      {product.inStock === false ? "Out of stock" : "In stock"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function CategoriesPanel({ data, limit }: { data: CommerceCatalogData | null; limit?: number }) {
  const categories = data?.categories ?? [];
  const shown = limit ? categories.slice(0, limit) : categories;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <CardDescription>Category counts and representative SKUs from the processed product cache.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No categories collected yet.</p>
        ) : (
          shown.map((category) => (
            <div key={category.name} className="rounded-lg border border-border bg-muted px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{category.name}</span>
                <Badge variant="secondary">{category.productCount} products</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {category.inStockCount} in stock · SKUs {category.sampleSkus.join(", ")}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function GeneratedDataPanel({ data }: { data: CommerceCatalogData | null }) {
  const generated = data?.generated;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Generated data</CardTitle>
        <CardDescription>Derived values used by the chat for budget buttons, discovery, CTAs, and related products.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border border-border bg-muted px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Offering mode</span>
            <Badge variant="default">{generated?.offeringMode ?? "unknown"}</Badge>
            {generated?.intelligenceModel && <Badge variant="secondary">{generated.intelligenceModel}</Badge>}
          </div>
          {generated?.intelligenceGeneratedAt && (
            <p className="mt-1 text-xs text-muted-foreground">Generated {new Date(generated.intelligenceGeneratedAt).toLocaleString()}</p>
          )}
          {generated?.intelligenceQuality && (
            <p className="mt-1 text-xs text-muted-foreground">
              Quality score {Math.round(generated.intelligenceQuality.score * 100)}%
              {generated.intelligenceQuality.warnings.length ? ` · ${generated.intelligenceQuality.warnings.join("; ")}` : ""}
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Offering types</h3>
            <DataChips values={generated?.offeringTypes} empty="No offering types generated yet" />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Audiences</h3>
            <DataChips values={generated?.audiences} empty="No audiences generated yet" />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Decision factors</h3>
            <DataChips values={generated?.decisionFactors} empty="No decision factors generated yet" />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Starter intents</h3>
            <DataChips values={generated?.starterIntents} empty="No starter intents generated yet" />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Use case profiles</h3>
          {Object.entries(generated?.useCaseProfiles ?? {}).length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {Object.entries(generated?.useCaseProfiles ?? {})
                .slice(0, 8)
                .map(([useCase, profile]) => (
                  <div key={useCase} className="rounded-lg border border-border bg-muted px-3 py-2.5">
                    <div className="font-medium">{useCase}</div>
                    <p className="mt-1 text-xs text-muted-foreground">Offerings: {listText(profile.offeringTypes, 4)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Audiences: {listText(profile.audiences, 4)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Factors: {listText(profile.decisionFactors, 4)}</p>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No use case profiles generated yet.</p>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Tenant price bands</h3>
          <div className="flex flex-wrap gap-2">
            {(generated?.priceBands ?? []).length ? (
              generated?.priceBands?.map((band) => (
                <Badge key={band.label} variant="default">
                  {band.label}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No price bands generated yet.</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Tags and styles</h3>
            <DataChips values={[...(generated?.tags ?? []), ...(generated?.styles ?? [])]} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Materials</h3>
            <DataChips values={generated?.materials} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Occasions</h3>
            <DataChips values={generated?.occasions} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Recipients</h3>
            <DataChips values={generated?.recipients} />
          </div>
          <div className="md:col-span-2">
            <h3 className="mb-2 text-sm font-semibold">Use cases and compatibility</h3>
            <DataChips values={generated?.useCases} />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Product type intelligence</h3>
          {(generated?.productTypeHints ?? []).length ? (
            <div className="grid gap-2 md:grid-cols-2">
              {generated?.productTypeHints?.slice(0, 8).map((hint) => (
                <div key={`${hint.source}:${hint.term}`} className="rounded-lg border border-border bg-muted px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{hint.term}</span>
                    <Badge variant="secondary">{hint.source.replace("_", " ")}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{priceCoverageText(hint.priceCoverage)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Top SKUs {listText(hint.topSkus, 4)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No product type intelligence generated yet.</p>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Gift profiles</h3>
            {Object.entries(generated?.giftProfiles ?? {}).length ? (
              <div className="space-y-2">
                {Object.entries(generated?.giftProfiles ?? {})
                  .slice(0, 6)
                  .map(([occasion, profile]) => (
                    <div key={occasion} className="rounded-lg border border-border bg-muted px-3 py-2.5">
                      <div className="font-medium">{occasion}</div>
                      <p className="mt-1 text-xs text-muted-foreground">Recipients: {listText(profile.recipients, 4)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Styles: {listText(profile.styles, 4)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{priceCoverageText(profile.priceCoverage)}</p>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No gift profiles generated yet.</p>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Attribute summaries</h3>
            {Object.entries(generated?.attributeSummaries ?? {}).length ? (
              <div className="space-y-2">
                {Object.entries(generated?.attributeSummaries ?? {})
                  .slice(0, 6)
                  .map(([category, summary]) => (
                    <div key={category} className="rounded-lg border border-border bg-muted px-3 py-2.5">
                      <div className="font-medium">{category}</div>
                      <p className="mt-1 text-xs text-muted-foreground">Materials: {listText(summary.materials, 4)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Use cases: {listText(summary.useCases, 4)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Variants: {listText(summary.variants, 4)}</p>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No attribute summaries generated yet.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function RelationshipPanels({ data }: { data: CommerceCatalogData | null }) {
  const generated = data?.generated;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Occasion recipient groups</CardTitle>
          <CardDescription>Recipient quick actions generated from occasion and recipient metadata.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(generated?.occasionRecipients ?? {}).length === 0 ? (
            <p className="text-sm text-muted-foreground">No occasion-recipient relationships generated yet.</p>
          ) : (
            Object.entries(generated?.occasionRecipients ?? {}).map(([occasion, recipients]) => (
              <div key={occasion} className="rounded-lg border border-border bg-muted px-3 py-2.5">
                <div className="font-medium">{occasion}</div>
                <p className="mt-1 text-sm text-muted-foreground">{recipients.join(", ")}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Related product groups</CardTitle>
          <CardDescription>Top SKUs grouped by category for relationship-aware product suggestions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(generated?.relatedByCategory ?? {}).length === 0 ? (
            <p className="text-sm text-muted-foreground">No related product groups generated yet.</p>
          ) : (
            Object.entries(generated?.relatedByCategory ?? {}).map(([category, skus]) => (
              <div key={category} className="rounded-lg border border-border bg-muted px-3 py-2.5">
                <div className="font-medium">{category}</div>
                <p className="mt-1 text-sm text-muted-foreground">{skus.join(", ")}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ProductAttributeGrid({ product }: { product: CommerceProductListItem }) {
  const rows = [
    ["Categories", product.categories?.join(", ")],
    ["Tags", product.tags?.join(", ")],
    ["Materials", product.material?.join(", ")],
    ["Occasions", product.occasion?.join(", ")],
    ["Recipients", product.recipient?.join(", ")],
    ["Compatibility / use cases", product.compatibility?.join(", ")],
    ["Bundles", product.bundles?.join(", ")],
    ["Variants", product.variants],
  ].filter(([, value]) => Boolean(value));

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-border bg-muted px-3 py-2.5">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
          <div className="mt-1 text-sm font-medium">{value}</div>
        </div>
      ))}
    </div>
  );
}

export function ProductPageShell({
  children,
  loading,
  error,
}: {
  children: React.ReactNode;
  loading?: boolean;
  error?: string | null;
}) {
  if (loading) return <AdminPageSkeleton cards={4} />;
  if (error) return <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>;
  return <div className="space-y-6">{children}</div>;
}

export function ProductSectionCard({
  title,
  description,
  href,
  className,
}: {
  title: string;
  description: string;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-lg border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_rgba(15,23,42,0.05)] transition-colors hover:border-primary/50 hover:bg-muted",
        className
      )}
    >
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </Link>
  );
}

export function ProductPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.075em] text-primary">Catalog intelligence</p>
          <h1 className="max-w-[760px] font-bold">{title}</h1>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      <ProductCatalogTabs />
    </div>
  );
}

export function ProductListSectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
      <SectionHeader
        eyebrow="Product records"
        title="Synced product list"
        description="Product cache fields collected from WooCommerce, Shopify, CSV imports, or other ecommerce connectors."
      />
      {children}
    </div>
  );
}

