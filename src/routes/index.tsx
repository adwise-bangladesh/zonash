import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listProducts, listCategories, listProductsByCategorySlug } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { CategoryTabs } from "@/components/home/CategoryTabs";
import { PromoIcons } from "@/components/home/PromoIcons";
import { DealsStrip } from "@/components/home/DealsStrip";
import { InfiniteFeed } from "@/components/home/InfiniteFeed";
import { TrustRow } from "@/components/home/TrustRow";
import type { WooProduct } from "@/lib/woo.server";

const megaSaleQuery = queryOptions({
  queryKey: ["home", "mega-sale"],
  queryFn: () => listProductsByCategorySlug({ data: { slug: "mega-sale", perPage: 16 } }),
  staleTime: 60_000,
});
const catQuery = queryOptions({
  queryKey: ["home", "categories"],
  queryFn: () => listCategories(),
  staleTime: 5 * 60_000,
});
// Fallback: featured/popular products in case the "mega-sale" category is empty.
const fallbackQuery = queryOptions({
  queryKey: ["home", "featured-fallback"],
  queryFn: () => listProducts({ data: { page: 1, perPage: 16, orderby: "popularity" } }),
  staleTime: 60_000,
});


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zonash — Fine Jewelry & Gifts, Delivered Across Bangladesh" },
      {
        name: "description",
        content:
          "Shop authentic gold-plated jewelry, gift boxes and trending finds at Zonash. Cash on delivery, 7-day returns, fast shipping across Bangladesh.",
      },
      { property: "og:title", content: "Zonash — Fine Jewelry & Gifts" },
      {
        property: "og:description",
        content:
          "Authentic jewelry, gift boxes and trending finds. COD, 7-day returns, nationwide delivery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(featuredQuery),
      context.queryClient.ensureQueryData(trendingQuery),
      context.queryClient.ensureQueryData(catQuery),
    ]);
  },
  component: Home,
  pendingComponent: HomeSkeleton,
});

/**
 * HomeSkeleton — pixel-mirrors the rendered Home layout so the transition
 * from placeholder to real content is imperceptible. Every block matches
 * the corresponding component's dimensions, spacing and radius.
 */
function HomeSkeleton() {
  return (
    <div className="min-h-screen bg-surface-muted/40" aria-busy="true" aria-live="polite">
      {/* Header (mirrors SiteHeader h-14 / md:h-16) */}
      <div className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="container-page flex h-14 items-center justify-between gap-3 md:h-16">
          <div className="h-6 w-28 skeleton-shimmer rounded-md md:h-7 md:w-32" />
          <div className="flex items-center gap-1">
            <div className="h-9 w-9 skeleton-shimmer rounded-full md:h-10 md:w-10" />
            <div className="hidden h-10 w-10 skeleton-shimmer rounded-full md:block" />
            <div className="h-9 w-9 skeleton-shimmer rounded-full md:h-10 md:w-10" />
          </div>
        </div>
      </div>

      <div className="bg-background">
        {/* CategoryTabs (sticky bar, gap-4 py-2, pl-[5px]) */}
        <div className="sticky top-14 z-30 border-b border-border bg-background/95 backdrop-blur md:top-16">
          <div className="flex gap-4 py-2 pl-[5px] pr-4 md:pl-4">
            {[64, 92, 78, 70, 82, 74, 90].map((w, i) => (
              <div
                key={i}
                className="h-4 shrink-0 skeleton-shimmer rounded-full"
                style={{ width: w }}
              />
            ))}
          </div>
        </div>

        {/* PromoIcons (5 shortcuts, h-14 rounded-2xl + label) */}
        <section className="pb-4 pt-2">
          <div className="container-page">
            <div className="mx-auto grid max-w-3xl grid-cols-5 gap-2 md:gap-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className="h-14 w-14 skeleton-shimmer rounded-2xl md:h-16 md:w-16" />
                  <div className="h-2.5 w-12 skeleton-shimmer rounded" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* DealsStrip (banner + row of 58/84px cards) */}
        <section className="pb-3">
          <div className="mx-[5px] overflow-hidden rounded-2xl bg-white p-2.5 ring-1 ring-border/60 shadow-sm md:p-3">
            <div className="flex items-stretch gap-2">
              <div className="h-[86px] w-[58px] shrink-0 skeleton-shimmer rounded-lg md:h-[116px] md:w-[84px]" />
              <div className="flex min-w-0 flex-1 gap-2 overflow-hidden">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex w-[58px] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-white md:w-[84px]"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className="aspect-square w-full skeleton-shimmer rounded-none" />
                    <div className="flex h-6 items-center justify-center md:h-7">
                      <div className="h-2.5 w-8 skeleton-shimmer rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Product grid (matches BigProductGrid) */}
      <div className="grid grid-cols-2 gap-2 px-[5px] md:grid-cols-3 md:gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="skeleton-row-fade flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-border/60"
            style={{ animationDelay: `${i * 45}ms` }}
          >
            <div className="aspect-square w-full skeleton-shimmer rounded-none" />
            <div className="flex flex-col gap-1.5 p-2.5">
              <div className="h-3 w-[92%] skeleton-shimmer rounded" />
              <div className="h-3 w-[70%] skeleton-shimmer rounded" />
              <div className="mt-1 h-3.5 w-16 skeleton-shimmer rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Home() {
  const { data: feat } = useSuspenseQuery(featuredQuery);
  const { data: trend } = useSuspenseQuery(trendingQuery);
  const { data: catData } = useSuspenseQuery(catQuery);
  const featured = feat.products as WooProduct[];
  const trending = trend.products as WooProduct[];
  const categories = catData.categories;

  return (
    <div className="min-h-screen bg-surface-muted/40">
      <AppHeader />
      <main className="animate-fade-in">
        <div className="bg-background">
          <CategoryTabs categories={categories} />
          <PromoIcons />
          <DealsStrip products={trending.length ? trending : featured} />
        </div>

        <InfiniteFeed />

        <TrustRow />

        {feat.error && (
          <div className="container-page py-6">
            <div
              role="alert"
              className="rounded-[3px] border border-warning/40 bg-warning/10 p-4 text-sm"
            >
              {feat.error}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
