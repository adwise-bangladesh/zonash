import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { useSuspenseQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { listProducts, listCategories, listProductsByCategorySlug } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { CategoryTabs } from "@/components/home/CategoryTabs";
import { PromoIcons } from "@/components/home/PromoIcons";
import { DealsStrip } from "@/components/home/DealsStrip";
import { InfiniteFeedSection, FeedGridSkeleton } from "@/components/home/InfiniteFeed";
import {
  AppHeaderSkeleton,
  CategoryTabsSkeleton,
  PromoIconsSkeleton,
  DealsStripSkeleton,
} from "@/components/home/skeletons";
import { SoftBoundary } from "@/components/SoftBoundary";


import { TrustRow } from "@/components/home/TrustRow";
import { recommendedInfiniteOptions } from "@/lib/recommended-feed";
import { SITE_URL, canonicalUrl } from "@/lib/site";
import type { WooProduct } from "@/lib/woo.server";

/**
 * Deals row: the "mega-sale" category is the only source of truth. When that
 * category has no published products the section is removed entirely (no
 * substitute products), and it reappears automatically once products are added.
 * Order is randomised per fetch so the strip rotates between visits.
 */
type DealsData = { products: WooProduct[]; error: string | null };
const DEALS_UNAVAILABLE: DealsData = {
  products: [],
  error: "Products are temporarily unavailable.",
};

/** Fisher-Yates on a copy — runs once per fetch (server-side for SSR), so the
 * hydrated cache and the SSR HTML always agree. */
function shuffle<T>(input: readonly T[]): T[] {
  const out = input.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

const dealsQuery = queryOptions<DealsData>({
  queryKey: ["home", "deals"],
  queryFn: async (): Promise<DealsData> => {
    const mega = await listProductsByCategorySlug({
      data: { slug: "mega-sale", perPage: 16 },
    }).catch(() => DEALS_UNAVAILABLE);
    // Defensive: a malformed/partial payload must not reach `shuffle`.
    const raw = Array.isArray(mega?.products) ? mega.products : [];
    const products = raw.filter((p) => p && typeof p.id === "number" && !!p.slug);
    // No mega-sale products => no section at all. Only a real transport error
    // is surfaced; an empty category is a valid, silent "hide me".
    if (!products.length) return { products: [], error: mega?.error ?? null };
    return { products: shuffle(products), error: null };
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
      context.queryClient.prefetchInfiniteQuery(recommendedInfiniteOptions).catch(() => undefined),
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
 * HomeSkeleton — composed from the very same skeleton components the live
 * sections fall back to, so the placeholder can never drift out of alignment
 * with the rendered layout (the earlier inline copies had to be kept in sync
 * by hand). `pl-[5px]` gutters, sticky offsets, radii and ring colours all
 * come from one place.
 */
function HomeSkeleton() {
  return (
    <div className="min-h-dvh bg-surface-muted/40" aria-busy="true" aria-live="polite">
      <AppHeaderSkeleton />

      <div className="bg-background">
        <CategoryTabsSkeleton />
        <PromoIconsSkeleton />
        <DealsStripSkeleton />
      </div>

      <FeedGridSkeleton columns={2} />
    </div>
  );
}


const EMPTY_PRODUCTS: WooProduct[] = [];

/**
 * Feed failure state. React Query caches the rejection, so remounting alone
 * would replay the same throw — reset the feed's cache entry first, then let
 * the boundary re-render the section.
 */
function FeedFallback({ onRetry }: { onRetry: () => void }) {
  const queryClient = useQueryClient();
  return (
    <div className="container-page py-10 text-center">
      <p className="text-sm text-muted-foreground">Products couldn&apos;t be loaded right now.</p>
      <button
        type="button"
        onClick={() => {
          void queryClient.resetQueries({ queryKey: recommendedInfiniteOptions.queryKey });
          onRetry();
        }}
        className="mt-3 rounded-full border border-border bg-white px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
      >
        Try again
      </button>
    </div>
  );
}

/**
 * Reads the deals query *inside* the boundary. Reading it in `Home` would put
 * the throw above the boundary, where only the route errorComponent can catch
 * it — the whole point of the guard is that a WooCommerce failure here costs
 * one strip, not the page.
 */
function DealsSection() {
  const { data: deals } = useSuspenseQuery(dealsQuery);
  // Stable identity: a fresh `[]` per render defeated the memoized deal cards.
  const products = deals?.products?.length ? deals.products : EMPTY_PRODUCTS;
  return <DealsStrip products={products} />;
}

function Home() {
  const { data: catData } = useSuspenseQuery(catQuery);
  const categories = catData?.categories;
  const errorMessage = categories?.length ? null : (catData?.error ?? null);

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
          <PromoIcons categories={categories} />

          {/*
            Optional chrome, two independent guards:
            - Suspense: while the deals query is in flight (client navigation,
              a cache miss after the 60s staleTime) the strip's exact footprint
              is held by the skeleton instead of collapsing to 0px and shoving
              the feed up.
            - SoftBoundary: if it throws, the strip is dropped exactly as it is
              when the category is empty — no error text, same silhouette.
          */}
          <SoftBoundary label="deals">
            <Suspense fallback={<DealsStripSkeleton />}>
              <DealsSection />
            </Suspense>
          </SoftBoundary>

        </div>

        {/*
          The feed reads through a suspense query: a rejected page throws during
          render and previously escalated to the route errorComponent, replacing
          the whole (otherwise healthy) homepage with a full-page error. Keep the
          blast radius inside this section.
        */}
        <SoftBoundary
          label="recommended-feed"
          fallback={(retry) => <FeedFallback onRetry={retry} />}
        >
          <InfiniteFeedSection columns={2} recommended />
        </SoftBoundary>

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
