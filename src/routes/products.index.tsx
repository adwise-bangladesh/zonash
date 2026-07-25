import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useSuspenseQuery,
  useSuspenseInfiniteQuery,
  queryOptions,
  infiniteQueryOptions,
} from "@tanstack/react-query";
import { Suspense, memo, useMemo, useCallback } from "react";
import { z } from "zod";
import { LayoutGrid, X } from "lucide-react";

import { listProducts, listPrimaryCategories, type WooCategory } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { InfiniteFeedSection, FeedGridSkeleton } from "@/components/home/InfiniteFeed";
import { SortTabs, sortToWoo, type SortKey } from "@/components/products/SortTabs";
import { NotFoundView } from "@/components/NotFoundView";
import { formatBDT } from "@/lib/format";
import { resolveCardPrices } from "@/lib/price-range";
import { buildResponsiveImage, buildThumbImage, onImageSrcSetError } from "@/lib/product-image";
import { getFeedNextPageParam, dedupeFeedPages, FEED_PER_PAGE, feedKeyFor } from "@/lib/home-feed";
import type { WooProduct } from "@/lib/woo.server";

const SITE_URL = "https://zonash.lovable.app";

const primaryCategoriesQuery = queryOptions({
  queryKey: ["categories", "primary"],
  queryFn: () => listPrimaryCategories(),
  staleTime: 5 * 60_000,
});

const SORT_KEYS = ["recommended", "new", "price-asc", "price-desc", "rating", "title"] as const;

/**
 * Every field is individually `.catch()`-ed: `validateSearch` throwing on a
 * hand-edited or stale URL (e.g. `?featured=1`, `?sort=cheap`) took the whole
 * route to the error boundary instead of degrading to the default shop view.
 * `featured` also arrives as a string from the URL, so it is coerced.
 */
const searchSchema = z.object({
  sort: z.enum(SORT_KEYS).optional().catch(undefined),
  // Clamp instead of reject: `.max(120)` threw for a long query, and the
  // `.catch(undefined)` then dropped the search entirely, silently dumping the
  // shopper into the unfiltered shop instead of searching the first 120 chars.
  q: z
    .string()
    .trim()
    .transform((v) => v.slice(0, 120))
    .optional()
    .catch(undefined),
  category: z
    .string()
    .trim()
    // Woo term slugs are lower-case; an upper-case slug in a shared/hand-typed
    // link passed validation but never matched the slug->id map, rendering an
    // empty "no results" page for a category that exists.
    .transform((v) => v.toLowerCase())
    .pipe(
      z
        .string()
        .max(96)
        .regex(/^[a-z0-9,-]+$/),
    )
    .optional()
    .catch(undefined),
  featured: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")])
    .optional()
    .catch(undefined),
});

const FILTER_PER_PAGE = 24;

/**
 * Filtered views used to be a single 30-item fetch, silently truncating any
 * category or search with more matches. They now paginate like the main feed.
 */
const searchProductsQuery = (
  search: string,
  category: string | undefined,
  featured: boolean | undefined,
  sort: SortKey,
) => {
  const { orderby, order } = sortToWoo(sort);
  return infiniteQueryOptions({
    queryKey: ["products", "search", search, category ?? "", featured ?? false, sort],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listProducts({
        data: {
          page: pageParam as number,
          perPage: FILTER_PER_PAGE,
          search: search || undefined,
          category,
          featured,
          orderby,
          order,
          // These cards never seed the product-detail cache, so the long
          // `description` / `short_description` HTML would be shipped twice
          // (SSR HTML + dehydrated cache) and rendered never.
          fields: "card" as const,
        },
      }),

    // Trust the server's `hasMore`, which is computed from the paginated text
    // query alone. Deriving it from the merged page length made SKU hits look
    // like "the page is full" and offered a dead extra page.
    getNextPageParam: (
      last: { products: WooProduct[]; hasMore?: boolean },
      all: { products: WooProduct[] }[],
    ) => (last?.hasMore === false ? undefined : getFeedNextPageParam(last, all, FILTER_PER_PAGE)),

    staleTime: 60_000,
    // Every distinct search term creates a cache entry; without a bounded
    // gcTime a long browsing session retains every result set it ever saw.
    gcTime: 5 * 60_000,
  });
};

/** A filtered view (search / featured / category) is never the canonical shop page. */
const isFiltered = (s: { q?: string; featured?: boolean; category?: string }) =>
  Boolean(s.q || s.featured || s.category);

export const Route = createFileRoute("/products/")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    q: search.q,
    category: search.category,
    featured: search.featured,
    sort: search.sort ?? "recommended",
  }),
  head: ({ match }) => {
    const s = match.search;
    const filtered = isFiltered(s);
    const title = s.q
      ? `Search: ${s.q} — Zonash`
      : filtered
        ? "Filtered Shop — Zonash Fine Jewelry"
        : "Shop All Jewelry — Zonash Fine Jewelry";
    const description = s.q
      ? `Search results for "${s.q}" in the Zonash jewelry collection.`
      : "Browse Zonash's full collection of fine jewelry — rings, chains, earrings and more, with cash on delivery across Bangladesh.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...(filtered ? [{ name: "robots", content: "noindex, follow" }] : []),
        { property: "og:type", content: "website" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: filtered ? [] : [{ rel: "canonical", href: `${SITE_URL}/products` }],
      // The canonical shop page was the only indexable variant of this route
      // and shipped no structured data at all, so search engines had no
      // breadcrumb or collection signal for it. Filtered views stay clean —
      // they are noindex.
      scripts: filtered
        ? []
        : [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@graph": [
                  {
                    "@type": "CollectionPage",
                    "@id": `${SITE_URL}/products`,
                    url: `${SITE_URL}/products`,
                    name: title,
                    description,
                    isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/`, name: "Zonash" },
                  },
                  {
                    "@type": "BreadcrumbList",
                    itemListElement: [
                      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
                      {
                        "@type": "ListItem",
                        position: 2,
                        name: "Shop",
                        item: `${SITE_URL}/products`,
                      },
                    ],
                  },
                ],
              }),
            },
          ],
    };
  },
  loader: async ({ context, deps }) => {
    const sort = deps.sort as SortKey;
    void context.queryClient.prefetchQuery(primaryCategoriesQuery).catch(() => undefined);
    if (deps.q || deps.featured || deps.category) {
      await context.queryClient
        .ensureInfiniteQueryData(
          searchProductsQuery(deps.q ?? "", deps.category, deps.featured, sort),
        )
        .catch(() => undefined);

      return;
    }
    const { orderby, order } = sortToWoo(sort);
    // Shared key builder: the loader and the feed component each derived this
    // key independently, so any drift made the awaited prefetch prime a cache
    // entry the component never read (skeleton + duplicate upstream call).
    const key = feedKeyFor(orderby, order);
    // Awaited: the feed reads through suspense, so an un-awaited prefetch made
    // the server suspend mid-stream and fall back to client rendering.
    await context.queryClient
      .prefetchInfiniteQuery({
        queryKey: key,
        initialPageParam: 1,
        queryFn: ({ pageParam }) =>
          listProducts({
            data: { page: pageParam as number, perPage: FEED_PER_PAGE, orderby, order },
          }),
        getNextPageParam: (last: { products: WooProduct[] }, all: { products: WooProduct[] }[]) =>
          getFeedNextPageParam(last, all, FEED_PER_PAGE),
        staleTime: 60_000,
      })
      .catch(() => undefined);
  },

  pendingComponent: ShopPending,
  errorComponent: ShopError,
  notFoundComponent: () => (
    <NotFoundView
      title="Page not found"
      description="This shop page doesn't exist. Browse the full collection instead."
      primaryLabel="Browse shop"
      primaryTo="/products"
    />
  ),
  component: Products,
});

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-surface-muted/40">{children}</div>;
}

function ShopPending() {
  return (
    <Shell>
      <AppHeader />
      <CategoryStripSkeleton />
      <div className="h-[38px] border-b border-border bg-background" aria-hidden="true" />
      <div className="pt-2">
        <FeedGridSkeleton columns={2} />
      </div>
    </Shell>
  );
}

function ShopError({ reset }: { reset: () => void }) {
  return (
    <NotFoundView
      variant="error"
      title="Shop is temporarily unavailable"
      description="We couldn't load the collection right now. Please try again."
      primaryLabel="Try again"
      onRetry={reset}
    />
  );
}

function Products() {
  const { q, category, featured, sort } = Route.useSearch();
  const activeSort = (sort ?? "recommended") as SortKey;
  if (q || featured || category) {
    return <FilteredResults q={q} category={category} featured={featured} sort={activeSort} />;
  }
  return <Shop sort={activeSort} />;
}

function Shop({ sort }: { sort: SortKey }) {
  const { orderby, order } = sortToWoo(sort);
  return (
    <Shell>
      <AppHeader />
      {/* Own boundary: a slow taxonomy call must not block the product feed. */}
      <Suspense fallback={<CategoryStripSkeleton />}>
        <PrimaryCategoryStrip />
      </Suspense>
      <SortTabs active={sort} />
      <main className="animate-fade-in">
        {/* The unfiltered shop is the only indexable variant of this route and
            it had no <h1> at all — the heading existed solely on the
            noindex'd filtered branch. */}
        <h1 className="sr-only">Shop all Zonash fine jewelry</h1>
        <div className="pt-2">
          <InfiniteFeedSection orderby={orderby} order={order} columns={2} />
        </div>
      </main>
    </Shell>
  );
}

/** Same box model as the live strip so swapping it in causes no layout shift. */
function CategoryStripSkeleton() {
  return (
    <div aria-hidden="true" className="bg-background pt-3 pb-3">
      <div className="flex gap-2 px-[5px]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="shrink-0 basis-[18%]">
            <div className="aspect-square w-full skeleton-shimmer rounded-2xl" />
            <div className="mx-auto mt-1.5 h-2.5 w-3/4 skeleton-shimmer rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PrimaryCategoryStrip() {
  const { data } = useSuspenseQuery(primaryCategoriesQuery);
  const cats = (data?.categories ?? []) as WooCategory[];
  if (!cats.length) return null;
  return (
    <nav aria-label="Shop categories" className="bg-background pt-3 pb-3">
      <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-[5px] px-[5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cats.map((c) => {
          // Category tiles render at ~70px; the raw Woo URL is the full-size
          // original (often >1 MB), so point at the generated crop instead.
          const thumb = buildThumbImage(c.image?.src, 96);
          return (
            <li key={c.id} className="shrink-0 basis-[18%] snap-start">
              <Link
                to="/c/$slug"
                params={{ slug: c.slug }}
                preload="intent"
                className="group flex flex-col items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl"
              >
                <span className="block aspect-square w-full overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/60 transition-shadow group-hover:shadow-md">
                  {thumb ? (
                    <img
                      src={thumb.src}
                      srcSet={thumb.srcSet}
                      alt=""
                      width={96}
                      height={96}
                      loading="lazy"
                      decoding="async"
                      onError={onImageSrcSetError}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center bg-surface-muted text-muted-foreground/60">
                      <LayoutGrid className="h-5 w-5" aria-hidden="true" />
                    </span>
                  )}
                </span>
                <span className="line-clamp-2 text-center text-[11px] font-medium leading-tight text-ink">
                  {c.name}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function FilteredResults({
  q,
  category,
  featured,
  sort,
}: {
  q: string | undefined;
  category: string | undefined;
  featured: boolean | undefined;
  sort: SortKey;
}) {
  const { data, refetch, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(searchProductsQuery(q ?? "", category, featured, sort));
  // Flattening + de-duping is O(pages x perPage); without memoization it re-ran
  // on every fetch-state tick (isFetching flips) as the list grows. The
  // validity filter is folded in here too — it used to run inside the grid on
  // every parent render, walking the whole (growing) list for nothing.

  const products = useMemo(
    () => (dedupeFeedPages(data?.pages) as WooProduct[]).filter((p) => p && p.slug),
    [data?.pages],
  );
  // Read the newest page's error, not page 1's: a "Load more" that failed
  // upstream returned an error the UI never surfaced (silent dead button).
  const error = data?.pages?.[data.pages.length - 1]?.error ?? null;

  // Previously a single chip with hard precedence (q > category > featured):
  // with two filters active the second one was invisible, and clicking the chip
  // wiped every filter AND the chosen sort. Each active filter now gets its own
  // chip that removes only itself and keeps `sort`.
  const chips = useMemo(() => {
    const list: { key: "q" | "category" | "featured"; label: string; capitalize: boolean }[] = [];
    if (q) list.push({ key: "q", label: `“${q}”`, capitalize: false });
    if (category)
      list.push({ key: "category", label: category.replace(/[,-]/g, " "), capitalize: true });
    if (featured) list.push({ key: "featured", label: "Featured", capitalize: false });
    return list;
  }, [q, category, featured]);

  const loadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <Shell>
      <AppHeader />
      {/* Keep taxonomy navigation available inside filtered views too. */}
      <Suspense fallback={<CategoryStripSkeleton />}>
        <PrimaryCategoryStrip />
      </Suspense>
      <SortTabs active={sort} />
      <main className="animate-fade-in">
        <div className="px-[5px] pb-24 pt-3">
          <h1 className="sr-only">{q ? `Search results for ${q}` : "Shop"}</h1>

          <div className="mb-3 flex items-center justify-between gap-2">
            {chips.length > 0 && (
              <ul className="flex min-w-0 flex-wrap items-center gap-1.5">
                {chips.map((chip) => (
                  <li key={chip.key}>
                    <Link
                      to="/products"
                      search={(prev: Record<string, unknown>) => {
                        const next = { ...prev };
                        delete next[chip.key];
                        return next as never;
                      }}
                      aria-label={`Remove filter ${chip.label}`}
                      className={`inline-flex max-w-[60vw] items-center gap-1.5 truncate rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-ink ${chip.capitalize ? "capitalize" : ""}`}
                    >
                      <span className="truncate">{chip.label}</span>
                      <X className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
              {products.length}
              {hasNextPage ? "+" : ""} result{products.length === 1 && !hasNextPage ? "" : "s"}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={retry}
                disabled={isFetching}
                className="rounded-full border border-border px-3 py-1 text-xs font-semibold transition-colors hover:bg-surface-muted disabled:opacity-60"
              >
                {isFetching ? "Retrying…" : "Try again"}
              </button>
            </div>
          )}

          {products.length === 0 && !error ? (
            <NotFoundView
              bare
              variant="empty"
              // A zero-result search is NOT an HTTP 404 — the previous
              // "not-found" variant printed an "Error 404" eyebrow above a
              // successful 200 response, which reads as a site fault.
              code={q ? "No results" : "Nothing here yet"}
              title={q ? "No matches found" : "Nothing here yet"}
              description={
                q
                  ? `We couldn't find anything for "${q}". Try a different word or browse the shop.`
                  : "Try another filter or browse the full shop."
              }
              // The CTA said "Clear search" even when no search term existed
              // (e.g. `?category=rings` with zero published products), offering
              // to clear something the shopper never typed.
              primaryLabel={q ? "Clear search" : "Browse shop"}
              primaryTo="/products"
            />
          ) : (
            <>
              <ProductGrid products={products} />
              {hasNextPage && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={isFetchingNextPage}
                    aria-busy={isFetchingNextPage}
                    className="rounded-full border border-border bg-card px-5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted disabled:opacity-60"
                  >
                    {isFetchingNextPage ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </Shell>
  );
}

// Memoized: the result grid re-renders on every parent state change otherwise,
// recomputing price parsing and the srcset for each card.
const ResultCard = memo(function ResultCard({ p, priority }: { p: WooProduct; priority: boolean }) {
  // `p.price` is empty/misleading for variable products — resolveCardPrices
  // derives the real min/sale price the same way the feed does.
  const { sell, regular } = resolveCardPrices(p);
  const image = p.images?.[0];
  const responsive = buildResponsiveImage(image?.src, {
    sizes: "(min-width: 480px) 240px, 50vw",
  });
  return (
    <li>
      <Link
        to="/products/$slug"
        params={{ slug: p.slug }}
        preload="intent"
        className="group flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/60 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="block aspect-square w-full overflow-hidden bg-surface-muted">
          {responsive ? (
            <img
              src={responsive.src}
              srcSet={responsive.srcSet}
              sizes={responsive.sizes}
              alt={image?.alt || p.name || "Product"}
              width={600}
              height={600}
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={priority ? "high" : "auto"}
              onError={onImageSrcSetError}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <span className="grid h-full w-full place-items-center bg-muted" />
          )}
        </span>
        <span className="flex flex-col gap-0.5 p-2">
          <span className="line-clamp-2 text-[12px] font-medium leading-tight text-foreground">
            {p.name}
          </span>
          <span className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-[13px] font-bold text-primary">{formatBDT(sell)}</span>
            {regular != null && (
              <span className="text-[10px] text-muted-foreground line-through">
                {formatBDT(regular)}
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
});

// Memoized: `FilteredResults` re-renders on every fetch-state tick (isFetching,
// isFetchingNextPage). Without this the whole <ul> reconciled each time; now a
// tick that leaves `products` identical skips the grid subtree entirely.
const ProductGrid = memo(function ProductGrid({ products }: { products: WooProduct[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {products.map((p, i) => (
        <ResultCard key={p.id} p={p} priority={i < 2} />
      ))}
    </ul>
  );
});
