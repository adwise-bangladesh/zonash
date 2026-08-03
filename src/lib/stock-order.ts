/**
 * Storefront product ordering — single source of truth for every grid.
 *
 * Order:
 *   1. Ready Stock  (`instock`)      — recently viewed first, then upstream
 *                                      order (WooCommerce popularity / sales).
 *   2. Supplier stock (`onbackorder`)
 *   3. Out of Stock (`outofstock`)
 *
 * The sort is STABLE, so whatever ordering the API already applied inside a
 * group (popularity, date, price) is preserved untouched.
 */
import { availabilityOf, type StockSource } from "@/lib/stock";

const RANK: Record<string, number> = { ready: 0, supplier: 1, out: 2 };

export function stockRank(p: StockSource): number {
  return RANK[availabilityOf(p).kind] ?? 1;
}

export function sortStorefrontProducts<P extends { id: number } & StockSource>(
  products: readonly P[],
  recentIds: readonly number[] = [],
): P[] {
  // Recency only reorders *within* the Ready Stock group: an out-of-stock item
  // the shopper viewed must not jump above buyable products.
  const recency = new Map<number, number>();
  recentIds.forEach((id, i) => {
    if (!recency.has(id)) recency.set(id, i);
  });

  return products
    .map((p, i) => {
      const rank = stockRank(p);
      const seen = rank === 0 ? recency.get(p.id) : undefined;
      return { p, i, rank, recent: seen === undefined ? Number.MAX_SAFE_INTEGER : seen };
    })
    .sort((a, b) => a.rank - b.rank || a.recent - b.recent || a.i - b.i)
    .map((x) => x.p);
}
