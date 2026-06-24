"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CatalogMetrics,
  CategoriesPanel,
  ProductPageHeader,
  ProductPageShell,
  useProductCatalog,
} from "../_components/product-catalog-ui";

export default function ProductCategoriesPage() {
  const { data, loading, error, reload } = useProductCatalog({ limit: 500 });

  return (
    <ProductPageShell loading={loading && !data} error={error}>
      <ProductPageHeader
        title="Product categories"
        description="Review category counts, in-stock coverage, and representative SKUs from processed catalog records."
        action={
          <Button variant="outline" onClick={() => reload()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />
      <CatalogMetrics data={data} />
      <CategoriesPanel data={data} />
    </ProductPageShell>
  );
}

