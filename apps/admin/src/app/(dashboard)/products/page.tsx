"use client";

import { useEffect, useMemo, useState } from "react";
import { Database, PackageSearch, RefreshCw, Search, Sparkles, Tags } from "lucide-react";
import { api } from "@/lib/api";
import type { CommerceCatalogData, CommerceProductListItem } from "@/lib/api/http-client";
import { PageIntro, MetricTile, SectionHeader } from "@/components/layout/admin-page";
import { AdminPageSkeleton } from "@/components/layout/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatPrice(price: number, currency = "USD") {
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

function listText(values?: string[], max = 3) {
  const clean = (values ?? []).filter(Boolean);
  if (!clean.length) return "—";
  const shown = clean.slice(0, max).join(", ");
  return clean.length > max ? `${shown} +${clean.length - max}` : shown;
}

function DataChips({ values, empty = "No data collected yet" }: { values?: string[]; empty?: string }) {
  const clean = (values ?? []).filter(Boolean);
  if (!clean.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {clean.slice(0, 28).map((value) => (
        <Badge key={value} variant="secondary" className="max-w-full truncate">
          {value}
        </Badge>
      ))}
      {clean.length > 28 && <Badge variant="outline">+{clean.length - 28} more</Badge>}
    </div>
  );
}

function ProductName({ product }: { product: CommerceProductListItem }) {
  return (
    <div className="min-w-[220px]">
      <div className="font-medium">{product.name}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{product.sku}</span>
        {product.sourceId && <span>Source {product.sourceId}</span>}
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [data, setData] = useState<CommerceCatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const load = async (q = query) => {
    const res = await api.commerce.listProducts({ q: q.trim() || undefined, limit: 300 });
    setData(res.data);
  };

  useEffect(() => {
    load("").finally(() => setLoading(false));
  }, []);

  const products = data?.items ?? [];
  const generated = data?.generated;
  const inStockCount = useMemo(() => products.filter((product) => product.inStock !== false).length, [products]);
  const attributeCount = useMemo(
    () =>
      [
        generated?.tags,
        generated?.materials,
        generated?.occasions,
        generated?.recipients,
        generated?.useCases,
        generated?.styles,
      ].reduce((sum, values) => sum + (values?.length ?? 0), 0),
    [generated]
  );
  const relatedGroups = Object.keys(generated?.relatedByCategory ?? {}).length;
  const occasionGroups = Object.keys(generated?.occasionRecipients ?? {}).length;

  if (loading && !data) return <AdminPageSkeleton cards={4} />;

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Catalog intelligence"
        title="Products"
        description="Review products synced from the ecommerce site, catalog categories, and generated data CommerceChat uses for recommendations, qualification, budget actions, and related product logic."
        action={
          <Button
            variant="outline"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              try {
                await load();
              } finally {
                setRefreshing(false);
              }
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

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
          detail={`${relatedGroups + occasionGroups} relationship groups`}
          icon={<Database className="h-4 w-4" />}
        />
      </div>

      <section className="space-y-3">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <SectionHeader
            eyebrow="Product records"
            title="Synced product list"
            description="Product cache fields collected from WooCommerce, Shopify, CSV imports, or other ecommerce connectors."
          />
          <form
            className="flex w-full gap-2 md:max-w-md"
            onSubmit={async (event) => {
              event.preventDefault();
              setRefreshing(true);
              try {
                await load(query);
              } finally {
                setRefreshing(false);
              }
            }}
          >
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, SKU, category" />
            <Button type="submit" variant="outline" disabled={refreshing}>
              <Search className="h-4 w-4" />
            </Button>
          </form>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Categories</TableHead>
                  <TableHead>Attributes</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No products found. Sync a commerce connector or upload a catalog from Knowledge.
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((product) => (
                    <TableRow key={product.sku}>
                      <TableCell>
                        <ProductName product={product} />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{formatPrice(product.price, product.currency)}</TableCell>
                      <TableCell className="max-w-[220px] text-sm text-muted-foreground">
                        {listText(product.categories)}
                      </TableCell>
                      <TableCell className="max-w-[300px] text-sm text-muted-foreground">
                        {listText([
                          ...(product.tags ?? []),
                          ...(product.material ?? []),
                          ...(product.occasion ?? []),
                          ...(product.recipient ?? []),
                        ])}
                      </TableCell>
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
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>Category counts and representative SKUs from the processed product cache.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.categories ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No categories collected yet.</p>
            ) : (
              (data?.categories ?? []).map((category) => (
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

        <Card>
          <CardHeader>
            <CardTitle>Generated data</CardTitle>
            <CardDescription>
              Derived values used by the chat for budget buttons, discovery questions, dynamic CTAs, and related products.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
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
          </CardContent>
        </Card>
      </div>

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
    </div>
  );
}
