/**
 * "Recommended for you" feed used on the homepage and under a product page.
 *
 * Ordering intent (not "newest published"):
 *  1. Featured products the store owner curated, best sellers first.
 *  2. Everything else by WooCommerce `popularity` (total sales), desc.
 *
 * Pagination is a ROW CURSOR, not a page number. Page 1 merges the curated list
 * with as many best sellers as fit in one screenful, which means it consumes
 * only part of the first upstream popularity page. Numbering the next request
 * "popularity page 2" therefore skipped every best seller the merge did not
 * have room for — with a full featured list that silently hid ~18 products from
 * the catalog, permanently, on every visit. The cursor is the number of
 * popularity rows already consumed, so the next request resumes exactly where
 * the previous one stopped.
 */
import { listProducts } from "@/lib/woo.functions";
import type { WooProduct } from "@/lib/woo.server";
import { FEED_PER_PAGE, recommendedFeedKey } from "@/lib/home-feed";

export type RecommendedPage = {
  products: WooProduct[];
  error?: string | null;
  /** Unfiltered upstream row count — the "is there more?" signal. */
  rawCount?: number;
  /** Popularity rows this page consumed (advances the cursor). */
  popConsumed?: number;
};

/**
 * Next cursor = total popularity rows consumed so far.
 *
 * Stops when the last upstream page came back short (or empty): a partial page
 * is the tail of the catalog, and a zero page after local filtering must not
 * spin the sentinel forever.
 */
export function getRecommendedNextParam(
  last: RecommendedPage | undefined,
  all: readonly RecommendedPage[],
): number | undefined {
  const raw = last?.rawCount ?? 0;
  if (raw === 0 || raw < FEED_PER_PAGE) return undefined;
  let consumed = 0;
  for (const p of all) consumed += p?.popConsumed ?? p?.rawCount ?? 0;
  return consumed > 0 ? consumed : undefined;
}

/**
 * Single source of truth for the recommended infinite query.
 *
 * The homepage loader prefetches it and the feed component subscribes to it;
 * when those two configs were written out separately any drift (key, page size,
 * staleTime) silently turned the awaited SSR prefetch into a different cache
 * entry and every visitor paid for a duplicate WooCommerce round trip.
 */
export const recommendedInfiniteOptions = {
  queryKey: [...recommendedFeedKey],
  initialPageParam: 0,
  queryFn: ({ pageParam }: { pageParam: number }) => fetchRecommendedPage(pageParam),
  getNextPageParam: (last: RecommendedPage, all: RecommendedPage[]) =>
    getRecommendedNextParam(last, all),
  staleTime: 60_000,
  retry: 1,
} as const;

/**
 * How many curated/featured products may lead the feed.
 *
 * Half a screenful, deliberately: if the curated list could fill page 1 on its
 * own the page would consume ZERO popularity rows, the cursor would not advance
 * and the feed would end after one screen. Featured products are ordinary
 * products, so anything past this cap still surfaces in the popularity walk.
 */
const FEATURED_LIMIT = Math.floor(FEED_PER_PAGE / 2);

/**
 * Mega Sale products own the deals strip at the top of the homepage; repeating
 * them in "Recommended for you" made the same card appear twice on one screen.
 */
const MEGA_SALE_SLUG = "mega-sale";

function isMegaSale(p: WooProduct): boolean {
  const cats = (p as { categories?: { slug?: string }[] }).categories;
  if (!Array.isArray(cats)) return false;
  for (const c of cats) if (c?.slug === MEGA_SALE_SLUG) return true;
  return false;
}

/**
 * @param cursor Popularity rows already consumed (0 = first screenful).
 */
export async function fetchRecommendedPage(cursor: number): Promise<RecommendedPage> {
  const offset = Math.max(0, Math.trunc(cursor || 0));
  const popular = {
    page: 1,
    offset,
    perPage: FEED_PER_PAGE,
    orderby: "popularity" as const,
    order: "desc" as const,
  };

  if (offset > 0) {
    const res = (await listProducts({ data: popular })) as RecommendedPage;
    const raw = res?.products ?? [];
    return {
      ...res,
      products: raw.filter((p) => !isMegaSale(p)),
      rawCount: raw.length,
      popConsumed: raw.length,
    };
  }

  const [featuredRes, popularRes] = await Promise.all([
    listProducts({
      data: {
        page: 1,
        perPage: FEATURED_LIMIT,
        featured: true,
        orderby: "popularity",
        order: "desc",
      },
    }).catch(() => ({ products: [] as WooProduct[], error: null })),
    listProducts({ data: popular }),
  ]);

  const featured = ((featuredRes as RecommendedPage)?.products ?? []).filter((p) => !isMegaSale(p));
  const rawRest = (popularRes as RecommendedPage)?.products ?? [];
  const seen = new Set<number>(featured.map((p) => p.id));

  // Page 1 stays exactly one screenful (FEED_PER_PAGE) like every later page —
  // the feed judges "is there more?" off page length, and an oversized first
  // page also rendered a visibly denser first screen. Instead of DROPPING the
  // overflow, we record how many popularity rows were actually consumed so the
  // next request continues from that row.
  const merged = featured.slice(0, FEATURED_LIMIT);
  let popConsumed = 0;
  for (const p of rawRest) {
    if (merged.length >= FEED_PER_PAGE) break;
    popConsumed++;
    if (isMegaSale(p) || seen.has(p.id)) continue;
    seen.add(p.id);
    merged.push(p);
  }

  return {
    products: merged,
    // Pagination follows the unfiltered popularity page length so filtering
    // Mega Sale items out never looks like the end of the catalog.
    rawCount: rawRest.length,
    popConsumed,
    // Only the popularity call is load-bearing: a featured outage degrades to
    // the plain best-seller list instead of blanking the section.
    error: (popularRes as RecommendedPage)?.error ?? null,
  };
}
