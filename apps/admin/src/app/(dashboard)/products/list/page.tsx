"use client";

import { useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CatalogMetrics,
  ProductListSectionHeader,
  ProductPageHeader,
  ProductPageShell,
  ProductTable,
  useProductCatalog,
} from "../_components/product-catalog-ui";

export default function ProductListPage() {
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, reload } = useProductCatalog({ limit: 500 });
  const products = data?.items ?? [];

  const search = async (q = query) => {
    setRefreshing(true);
    try {
      await reload({ q: q.trim() || undefined, limit: 500 });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ProductPageShell loading={loading && !data} error={error}>
      <ProductPageHeader
        title="Product list"
        description="Search and open product records synced from ecommerce connectors or catalog imports."
        action={
          <Button variant="outline" onClick={() => search()} disabled={refreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />
      <CatalogMetrics data={data} />
      <section className="space-y-3">
        <ProductListSectionHeader>
          <form
            className="flex w-full gap-2 md:max-w-md"
            onSubmit={(event) => {
              event.preventDefault();
              search();
            }}
          >
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, SKU, category" />
            <Button type="submit" variant="outline" disabled={refreshing}>
              <Search className="h-4 w-4" />
            </Button>
          </form>
        </ProductListSectionHeader>
        <ProductTable products={products} />
      </section>
    </ProductPageShell>
  );
}

