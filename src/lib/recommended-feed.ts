/**
 * "Recommended for you" feed used on the homepage and under a product page.
 *
 * Ordering intent (not "newest published"):
 *  1. Featured products the store owner curated, best sellers first.
 *  2. Everything else by WooCommerce `popularity` (total sales), desc.
 *
 * Page 1 merges the two lists (featured first) and every later page continues
 * the popularity walk. Duplicates between the two lists are dropped here and
 * again by `dedupeFeedPages`, so a featured product never renders twice.
 */
import { listProducts } from "@/lib/woo.functions";
import type { WooProduct } from "@/lib/woo.server";
import { FEED_PER_PAGE } from "@/lib/home-feed";

export type RecommendedPage = { products: WooProduct[]; error?: string | null };

/** How many curated/featured products may lead the feed. */
const FEATURED_LIMIT = FEED_PER_PAGE;

export async function fetchRecommendedPage(page: number): Promise<RecommendedPage> {
  const popular = {
    page,
    perPage: FEED_PER_PAGE,
    orderby: "popularity" as const,
    order: "desc" as const,
  };

  if (page > 1) {
    return (await listProducts({ data: popular })) as RecommendedPage;
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

  const featured = (featuredRes as RecommendedPage)?.products ?? [];
  const rest = (popularRes as RecommendedPage)?.products ?? [];
  const seen = new Set<number>(featured.map((p) => p.id));

  // Page 1 must return exactly FEED_PER_PAGE like every later page: the
  // infinite feed decides "is there another page?" from the page length, and
  // an oversized first page also rendered a visibly denser first screen.
  // Overflow is simply dropped — page 2 continues the popularity walk and
  // `dedupeFeedPages` removes anything that reappears.
  const merged = [...featured, ...rest.filter((p) => !seen.has(p.id))];

  return {
    products: merged.slice(0, FEED_PER_PAGE),
    // Only the popularity call is load-bearing: a featured outage degrades to
    // the plain best-seller list instead of blanking the section.
    error: (popularRes as RecommendedPage)?.error ?? null,
  };
}

