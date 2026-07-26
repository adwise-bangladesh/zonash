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

  return {
    products: [...featured, ...rest.filter((p) => !seen.has(p.id))],
    // Only the popularity call is load-bearing: a featured outage degrades to
    // the plain best-seller list instead of blanking the section.
    error: (popularRes as RecommendedPage)?.error ?? null,
  };
}
