import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AdminScaffold,
  EmptyState,
  InfoRow,
  MetricCard,
  PrimaryButton,
  Section,
  TextField,
} from "../../../src/components/admin/AdminScaffold";
import { api, type CommerceCatalogData, type CommerceProductListItem } from "../../../src/lib/api";
import { colors } from "../../../src/theme/colors";

type ConnectorStatus = {
  connected: boolean;
  siteUrl?: string;
  shopDomain?: string;
  lastSyncAt?: string;
  widgetEnabled?: boolean;
};

export default function CatalogScreen() {
  const [catalog, setCatalog] = useState<CommerceCatalogData | null>(null);
  const [wordpress, setWordpress] = useState<ConnectorStatus | null>(null);
  const [shopify, setShopify] = useState<ConnectorStatus | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [productsRes, wordpressRes, shopifyRes] = await Promise.all([
        api.commerce.listProducts({ limit: 100 }),
        api.commerce.wordpressStatus(),
        api.commerce.shopifyStatus(),
      ]);
      setCatalog(productsRes.data);
      setWordpress(wordpressRes.data);
      setShopify(shopifyRes.data);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Failed to load catalog");
    } finally {
      setLoading(false);
      setBusy(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const products = useMemo(() => {
    const items = catalog?.items ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.name, item.sku, item.category, ...(item.categories ?? []), ...(item.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [catalog, query]);

  async function sync(kind: "wordpress" | "shopify") {
    setBusy(kind);
    try {
      await (kind === "wordpress" ? api.commerce.syncWordPress() : api.commerce.syncShopify());
      Alert.alert("Sync started", "Catalog sync has been queued.");
      await load();
    } catch (e) {
      setError((e as { message?: string }).message ?? "Sync failed");
      setBusy(null);
    }
  }

  return (
    <AdminScaffold
      title="Catalog"
      subtitle={`${catalog?.total ?? catalog?.items.length ?? 0} products`}
      loading={loading}
      error={error}
      actionLabel="Refresh"
      onAction={load}
    >
      <Section title="Commerce connectors">
        <ConnectorRows
          label="WooCommerce"
          status={wordpress}
          onSync={() => sync("wordpress")}
          disabled={busy === "wordpress" || !wordpress?.connected}
        />
        <ConnectorRows
          label="Shopify"
          status={shopify}
          onSync={() => sync("shopify")}
          disabled={busy === "shopify" || !shopify?.connected}
        />
      </Section>

      {catalog?.generated ? (
        <Section title="Generated intelligence">
          <View style={styles.grid}>
            <MetricCard label="Mode" value={catalog.generated.offeringMode ?? "unknown"} />
            <MetricCard
              label="Quality"
              value={catalog.generated.intelligenceQuality?.score ?? "n/a"}
            />
          </View>
          {catalog.generated.intelligenceQuality?.warnings?.length ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>Quality notes</Text>
              {catalog.generated.intelligenceQuality.warnings.slice(0, 3).map((warning) => (
                <Text key={warning} style={styles.warningText}>
                  {warning}
                </Text>
              ))}
            </View>
          ) : null}
          <ChipGroup
            title="Starter intents"
            items={catalog.generated.starterIntents ?? []}
            emptyMessage="Starter intents will appear after catalog intelligence runs."
            limit={10}
          />
          <ChipGroup
            title="Tags"
            items={catalog.generated.tags ?? []}
            emptyMessage="Tags will appear after catalog intelligence runs."
            limit={12}
          />
        </Section>
      ) : null}

      <Section title="Categories">
        {catalog?.categories?.length ? (
          catalog.categories.slice(0, 8).map((category) => (
            <InfoRow
              key={category.name}
              label={category.name}
              value={`${category.inStockCount}/${category.productCount} in stock`}
            />
          ))
        ) : (
          <EmptyState message="Category summaries will appear after catalog sync." />
        )}
      </Section>

      <TextField
        label="Search products"
        value={query}
        onChangeText={setQuery}
        placeholder="Name, SKU, category, tag"
      />

      <Section title="Products">
        {products.length ? (
          products.slice(0, 40).map((product) => <ProductRow key={product.sku} product={product} />)
        ) : (
          <EmptyState message="No products found." />
        )}
      </Section>
    </AdminScaffold>
  );
}

function ConnectorRows({
  label,
  status,
  onSync,
  disabled,
}: {
  label: string;
  status: ConnectorStatus | null;
  onSync: () => void;
  disabled?: boolean;
}) {
  const host = status?.siteUrl ?? status?.shopDomain;
  return (
    <View style={styles.connector}>
      <InfoRow
        label={label}
        value={status?.connected ? host ?? "Connected" : "Disconnected"}
        tone={status?.connected ? "good" : "warn"}
      />
      <PrimaryButton label={`Sync ${label}`} onPress={onSync} disabled={disabled} />
    </View>
  );
}

function ProductRow({ product }: { product: CommerceProductListItem }) {
  return (
    <Pressable style={styles.product}>
      <View style={styles.productMain}>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.productMeta} numberOfLines={1}>
          {product.sku} · {product.category ?? product.categories?.[0] ?? "Uncategorized"}
        </Text>
      </View>
      <View style={styles.productSide}>
        <Text style={styles.price}>
          {product.currency ?? "USD"} {product.price}
        </Text>
        <Text style={[styles.stock, product.inStock === false && styles.outStock]}>
          {product.inStock === false ? "Out" : "In stock"}
        </Text>
      </View>
    </Pressable>
  );
}

function ChipGroup({
  title,
  items,
  emptyMessage,
  limit,
}: {
  title: string;
  items: string[];
  emptyMessage: string;
  limit: number;
}) {
  const visible = items.filter(Boolean).slice(0, limit);
  const remaining = Math.max(items.length - visible.length, 0);

  return (
    <View style={styles.chipGroup}>
      <View style={styles.chipHeader}>
        <Text style={styles.chipTitle}>{title}</Text>
        {remaining > 0 ? <Text style={styles.chipCount}>+{remaining} more</Text> : null}
      </View>
      {visible.length ? (
        <View style={styles.chips}>
          {visible.map((item) => (
            <View key={`${title}-${item}`} style={styles.intelChip}>
              <Text style={styles.intelChipText} numberOfLines={2}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyInline}>{emptyMessage}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  warningBox: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 9,
    gap: 3,
  },
  warningTitle: { color: "#92400E", fontWeight: "800", fontSize: 12 },
  warningText: { color: "#92400E", lineHeight: 17, fontSize: 12 },
  chipGroup: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 9,
    gap: 7,
  },
  chipHeader: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  chipTitle: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  chipCount: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  intelChip: {
    backgroundColor: colors.softSurface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    maxWidth: "100%",
  },
  intelChipText: { color: colors.text, fontSize: 12, fontWeight: "700", lineHeight: 15 },
  emptyInline: { color: colors.textMuted, lineHeight: 18, fontSize: 12 },
  connector: { gap: 8 },
  product: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  productMain: { flex: 1 },
  productName: { color: colors.text, fontSize: 13, fontWeight: "800" },
  productMeta: { color: colors.textMuted, marginTop: 2, fontSize: 11 },
  productSide: { alignItems: "flex-end" },
  price: { color: colors.text, fontWeight: "800", fontSize: 12 },
  stock: { color: colors.primary, fontSize: 11, marginTop: 2, fontWeight: "700" },
  outStock: { color: colors.danger },
});
