/**
 * Pure helpers for the homepage infinite product feed.
 *
 * Extracted so pagination edge cases (partial pages, empty pages, duplicate
 * products across overlapping pages) can be unit tested without spinning up
 * React, WooCommerce, or a network layer.
 */

export type FeedProduct = { id: number };

export type FeedPage<P extends FeedProduct = FeedProduct> = {
  products: P[];
  error?: string | null;
};

/**
 * Compute the next page param for the homepage feed.
 *
 * Rules:
 * - If the last page returned 0 products → stop (undefined).
 * - If the last page returned fewer than `perPage` → stop (partial page = tail).
 * - Otherwise the next page is `pages.length + 1` (1-indexed).
 *
 * The strict `< perPage` check protects against endless spinner loops when
 * WooCommerce returns a short page or an error payload with zero products.
 */
export function getFeedNextPageParam<P extends FeedProduct>(
  last: FeedPage<P> | undefined,
  allPages: FeedPage<P>[],
  perPage: number,
): number | undefined {
  const n = last?.products?.length ?? 0;
  if (n === 0 || n < perPage) return undefined;
  return allPages.length + 1;
}

/**
 * Flatten paginated feed responses into a single list, de-duplicating by
 * product id in case pages overlap (WooCommerce ordering ties, new inserts
 * between fetches, etc.).
 */
export function dedupeFeedPages<P extends FeedProduct>(
  pages: readonly FeedPage<P>[] | undefined,
): P[] {
  const seen = new Set<number>();
  const out: P[] = [];
  for (const page of pages ?? []) {
    for (const p of page.products ?? []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}
