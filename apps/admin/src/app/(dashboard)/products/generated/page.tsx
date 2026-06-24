"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  CatalogMetrics,
  GeneratedDataPanel,
  ProductPageHeader,
  ProductPageShell,
  RelationshipPanels,
  useProductCatalog,
} from "../_components/product-catalog-ui";

export default function ProductGeneratedDataPage() {
  const { data, loading, error, reload } = useProductCatalog({ limit: 500 });
  const [regenerating, setRegenerating] = useState(false);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const res = await api.commerce.regenerateProductAttributes();
      toast.success(`Regenerated attributes for ${res.data.updated} of ${res.data.total} products`);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not regenerate product attributes");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <ProductPageShell loading={loading && !data} error={error}>
      <ProductPageHeader
        title="Generated product data"
        description="Inspect derived catalog intelligence used by sales questions, dynamic actions, budget buttons, and related product recommendations."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => reload()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={regenerate} disabled={regenerating}>
              <RefreshCw className="h-4 w-4" />
              {regenerating ? "Regenerating..." : "Regenerate attributes"}
            </Button>
          </div>
        }
      />
      <CatalogMetrics data={data} />
      <GeneratedDataPanel data={data} />
      <RelationshipPanels data={data} />
    </ProductPageShell>
  );
}

