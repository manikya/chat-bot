"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CatalogMetrics,
  CategoriesPanel,
  GeneratedDataPanel,
  ProductListSectionHeader,
  ProductPageHeader,
  ProductPageShell,
  ProductSectionCard,
  ProductTable,
  RelationshipPanels,
  useProductCatalog,
} from "./_components/product-catalog-ui";

export default function ProductsPage() {
  const { data, loading, error, reload } = useProductCatalog({ limit: 300 });
  const products = data?.items ?? [];

  return (
    <ProductPageShell loading={loading && !data} error={error}>
      <ProductPageHeader
        title="Products"
        description="Review synced products, category summaries, and generated catalog intelligence CommerceChat uses for recommendations and sales guidance."
        action={
          <Button variant="outline" onClick={() => reload()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <CatalogMetrics data={data} />

      <div className="grid gap-4 md:grid-cols-3">
        <ProductSectionCard
          href="/products/list"
          title="Product list"
          description="Search and open product detail records from the synced commerce cache."
        />
        <ProductSectionCard
          href="/products/categories"
          title="Categories"
          description="Review category counts, stock coverage, and representative SKUs."
        />
        <ProductSectionCard
          href="/products/generated"
          title="Generated data"
          description="Inspect price bands, relationship groups, attributes, and derived sales hints."
        />
      </div>

      <section className="space-y-3">
        <ProductListSectionHeader>
          <Button asChild variant="outline">
            <Link href="/products/list">View all</Link>
          </Button>
        </ProductListSectionHeader>
        <ProductTable products={products.slice(0, 8)} compact />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <CategoriesPanel data={data} limit={5} />
        <GeneratedDataPanel data={data} />
      </div>

      <RelationshipPanels data={data} />
    </ProductPageShell>
  );
}
