"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatProductPrice,
  ProductAttributeGrid,
  ProductPageShell,
  productHref,
  useProductCatalog,
} from "../_components/product-catalog-ui";

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ProductDetailPage() {
  const params = useParams<{ sku?: string | string[] }>();
  const sku = decodeURIComponent(paramValue(params.sku) ?? "");
  const { data, loading, error } = useProductCatalog({ limit: 500 });
  const product = (data?.items ?? []).find((item) => item.sku === sku);

  if (!loading && !product) {
    return (
      <ProductPageShell error={error}>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/products/list">
            <ArrowLeft className="h-4 w-4" />
            Back to products
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Product not found</CardTitle>
            <CardDescription>SKU {sku || "unknown"} is not present in the current product cache.</CardDescription>
          </CardHeader>
        </Card>
      </ProductPageShell>
    );
  }

  return (
    <ProductPageShell loading={loading && !data} error={error}>
      {product && (
        <>
          <div className="flex flex-wrap items-start gap-4">
            <Button variant="outline" size="icon" asChild>
              <Link href="/products/list" aria-label="Back to products">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0 flex-1">
              <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.075em] text-primary">Product detail</p>
              <h1 className="max-w-[860px] font-bold">{product.name}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline">{product.sku}</Badge>
                <Badge variant={product.inStock === false ? "warning" : "success"}>
                  {product.inStock === false ? "Out of stock" : "In stock"}
                </Badge>
                <Badge>{formatProductPrice(product.price, product.currency)}</Badge>
                {product.category && <Badge variant="secondary">{product.category}</Badge>}
              </div>
            </div>
            {product.productUrl && (
              <Button variant="outline" asChild>
                <a href={product.productUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Open storefront
                </a>
              </Button>
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Product media</CardTitle>
                <CardDescription>Images collected from the ecommerce product record.</CardDescription>
              </CardHeader>
              <CardContent>
                {product.imageUrl || product.imageUrls?.length ? (
                  <div className="grid gap-3">
                    {(product.imageUrls?.length ? product.imageUrls : [product.imageUrl]).filter(Boolean).slice(0, 6).map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt={product.name}
                        className="max-h-[320px] w-full rounded-lg border border-border object-cover"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid min-h-[220px] place-items-center rounded-lg border border-dashed border-border bg-muted text-sm text-muted-foreground">
                    No images synced
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Commerce fields</CardTitle>
                  <CardDescription>Raw and generated product metadata available to recommendations.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {product.description && (
                    <div>
                      <h3 className="mb-1 text-sm font-semibold">Description</h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">{product.description}</p>
                    </div>
                  )}
                  <ProductAttributeGrid product={product} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Catalog relationships</CardTitle>
                  <CardDescription>Generated groups this product may participate in.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(product.categories ?? []).map((category) => {
                    const related = data?.generated?.relatedByCategory?.[category] ?? [];
                    return (
                      <div key={category} className="rounded-lg border border-border bg-muted px-3 py-2.5">
                        <div className="font-medium">{category}</div>
                        {related.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {related.slice(0, 8).map((relatedSku) => (
                              <Button key={relatedSku} asChild variant="secondary" size="sm">
                                <Link href={productHref(relatedSku)}>{relatedSku}</Link>
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-muted-foreground">No generated related SKUs for this category yet.</p>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </ProductPageShell>
  );
}

