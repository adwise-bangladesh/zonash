import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listProducts, listCategories, listProductsByCategorySlug } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { CategoryTabs } from "@/components/home/CategoryTabs";
import { PromoIcons } from "@/components/home/PromoIcons";
import { DealsStrip } from "@/components/home/DealsStrip";
import { InfiniteFeed } from "@/components/home/InfiniteFeed";
import { TrustRow } from "@/components/home/TrustRow";
import { getFeedNextPageParam, FEED_PER_PAGE, recommendedFeedKey } from "@/lib/home-feed";
import { fetchRecommendedPage } from "@/lib/recommended-feed";
import { SITE_URL, canonicalUrl } from "@/lib/site";
import type { WooProduct } from "@/lib/woo.server";

/**
 * Deals row: the "mega-sale" category is the source of truth. Only when it is
 * empty do we pay for a second request (popular products) — previously both
 * calls ran on every homepage render.
 */
const dealsQuery = queryOptions({
  queryKey: ["home", "deals"],
  queryFn: async () => {
    const unavailable = {
      products: [] as WooProduct[],
      error: "Products are temporarily unavailable.",
    };
    const mega = await listProductsByCategorySlug({
      data: { slug: "mega-sale", perPage: 16 },
    }).catch(() => unavailable);
    if (mega.products?.length) {
      return { products: mega.products as WooProduct[], error: null as string | null };
    }
    const fallback = await listProducts({
      data: { page: 1, perPage: 16, orderby: "popularity" },
    }).catch(() => unavailable);
    return {
      products: (fallback.products ?? []) as WooProduct[],
      error: (mega.error ?? fallback.error ?? null) as string | null,
    };
  },
  staleTime: 60_000,
});
const catQuery = queryOptions({
  queryKey: ["home", "categories"],
  queryFn: () => listCategories(),
  staleTime: 5 * 60_000,
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zonash — Fine Jewelry & Gifts, Delivered Across Bangladesh" },
      {
        name: "description",
        content:
          "Shop authentic gold-plated jewelry, gift boxes and trending finds at Zonash. Cash on delivery, instant returns, fast shipping across Bangladesh.",
      },
      { property: "og:title", content: "Zonash — Fine Jewelry & Gifts" },
      {
        property: "og:description",
        content:
          "Authentic jewelry, gift boxes and trending finds. COD, instant returns, nationwide delivery.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonicalUrl("/") },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    // One canonical origin: the same app also answers on the preview host and
    // the stable project host, which would otherwise be indexed as duplicates.
    links: [{ rel: "canonical", href: canonicalUrl("/") }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": `${SITE_URL}/#organization`,
              name: "Zonash",
              url: SITE_URL,
              areaServed: "BD",
            },
            {
              "@type": "WebSite",
              "@id": `${SITE_URL}/#website`,
              name: "Zonash",
              url: SITE_URL,
              inLanguage: "en-BD",
              publisher: { "@id": `${SITE_URL}/#organization` },
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate: `${SITE_URL}/products?search={search_term_string}`,
                },
                "query-input": "required name=search_term_string",
              },
            },
          ],
        }),
      },
    ],
  }),

  loader: async ({ context }) => {
    // Critical: block SSR/render on above-the-fold data, including the feed's
    // first page — an un-awaited prefetch made the SSR HTML (empty feed)
    // disagree with the hydrated cache (populated feed), forcing React to
    // throw away and re-render the whole tree on hydration.
    // Never reject — a Woo outage must still render the shell + empty states.
    await Promise.all([
      context.queryClient.ensureQueryData(dealsQuery).catch(() => undefined),
      context.queryClient.ensureQueryData(catQuery).catch(() => undefined),
      context.queryClient
        .prefetchInfiniteQuery({
          queryKey: [...recommendedFeedKey],
          initialPageParam: 1,
          queryFn: ({ pageParam }) => fetchRecommendedPage(pageParam as number),
          getNextPageParam: (last: { products: WooProduct[] }, all: { products: WooProduct[] }[]) =>
            getFeedNextPageParam(last, all, FEED_PER_PAGE),
          staleTime: 60_000,
        })
        .catch(() => undefined),
    ]);
  },

  component: Home,
  pendingComponent: HomeSkeleton,
  errorComponent: HomeError,
  notFoundComponent: HomeError,
});

/** Route-level error boundary: keeps chrome intact and offers a retry. */
function HomeError() {
  return (
    <div className="min-h-dvh bg-surface-muted/40">
      <AppHeader />
      <main className="container-page grid place-items-center py-24 text-center">
        <div role="alert" className="max-w-sm space-y-3">
          <h1 className="font-display text-xl font-bold text-ink">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            We couldn't load the storefront just now. Please try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
          >
            Reload
          </button>
        </div>
      </main>
    </div>
  );
}

/**
 * HomeSkeleton — pixel-mirrors the rendered Home layout so the transition
 * from placeholder to real content is imperceptible. Every block matches
 * the corresponding component's dimensions, spacing and radius.
 */
function HomeSkeleton() {
  return (
    <div className="min-h-dvh bg-surface-muted/40" aria-busy="true" aria-live="polite">
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

      {/* Product grid (matches BigProductGrid — 2 columns for the feed) */}
      <div className="grid grid-cols-2 gap-2 px-[5px]">
        {Array.from({ length: 8 }).map((_, i) => (

          <div
            key={i}
            className="skeleton-row-fade flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-border/60"
            style={{ animationDelay: `${i * 45}ms` }}
          >
            <div className="aspect-square w-full skeleton-shimmer rounded-none" />
            <div className="flex flex-col gap-1.5 p-2">
              <div className="h-3 w-[92%] skeleton-shimmer rounded" />
              <div className="h-3 w-[70%] skeleton-shimmer rounded" />
              <div className="mt-1 h-3.5 w-12 skeleton-shimmer rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Home() {
  const { data: deals } = useSuspenseQuery(dealsQuery);
  const { data: catData } = useSuspenseQuery(catQuery);
  const dealsProducts = deals?.products ?? [];
  const categories = catData?.categories ?? [];
  const errorMessage = deals?.error ?? catData?.error ?? null;

  return (
    <div className="min-h-dvh bg-surface-muted/40">
      <AppHeader />
      <CategoryTabs categories={categories} />
      <main className="animate-fade-in">
        {/*
          The visual design intentionally leads with the category bar rather
          than a headline, so the document's single H1 is exposed to crawlers
          and screen readers without altering the layout.
        */}
        <h1 className="sr-only">
          Zonash — fine jewelry, gift boxes and trending finds delivered across Bangladesh
        </h1>

        <div className="bg-background">
          <PromoIcons />

          <DealsStrip products={dealsProducts} />
        </div>

        <InfiniteFeed columns={2} />

        <TrustRow />

        {errorMessage && (
          <div className="container-page py-6">
            <div
              role="alert"
              className="rounded-[3px] border border-warning/40 bg-warning/10 p-4 text-sm"
            >
              {errorMessage}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
