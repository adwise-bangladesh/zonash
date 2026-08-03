import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useSuspenseQuery,
  useInfiniteQuery,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { Loader2, ShoppingBag, PackageOpen, Sparkles } from "lucide-react";
import {
  getCategoryWithSubs,
  listProducts,
  getProductVariations,
} from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";

import { formatBDT } from "@/lib/format";
import { itemKey, lineKey, useCart } from "@/lib/cart";
import type { CartItem } from "@/lib/cart";
import type { WooProduct } from "@/lib/woo.server";
import { QuickCard, VARIATIONS_STALE_MS } from "@/components/collection/QuickCard";
import { NotFoundView } from "@/components/NotFoundView";

const categoryQuery = (slug: string) =>
  queryOptions({
    queryKey: ["collection-page", slug],
    queryFn: () => getCategoryWithSubs({ data: { slug } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/collection/$slug")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(categoryQuery(params.slug)),
  head: ({ params, loaderData }) => {
    const fallback = params.slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    const name = loaderData?.parent?.name || fallback;
    const url = `https://zonash.lovable.app/collection/${params.slug}`;
    const title = `${name} — Quick Shop | Zonash`;
    const description = `Tap to add — shop the entire ${name} collection in seconds.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: CollectionQuickShop,
  pendingComponent: PageSkeleton,
  errorComponent: ({ error, reset }) => (
    <NotFoundView
      variant="error"
      title="Couldn't load this collection"
      description={error.message}
      onRetry={() => reset()}
    />
  ),
  notFoundComponent: () => (
    <NotFoundView
      title="Collection not found"
      description="This category doesn't exist yet. Browse everything else in the shop."
      primaryLabel="Browse all"
      primaryTo="/products"
    />
  ),
});


function CollectionQuickShop() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(categoryQuery(slug));
  const parent = data.parent;

  if (!parent?.id) {
    return (
      <NotFoundView
        title="Collection unavailable"
        description="This collection isn't set up yet. Explore the rest of the shop while we get it ready."
        primaryLabel="Browse all"
        primaryTo="/products"
      />
    );
  }

  return (
    <div className="min-h-screen bg-surface-muted/40 pb-28">
      <AppHeader />
      <main>
        <div className="px-[5px] pt-2.5 pb-1.5">
          <div className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-3 py-2 ring-1 ring-primary/15">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <p className="text-[12px] font-semibold leading-tight text-ink">
              Tap any item to add
              <span className="ml-1 font-normal text-muted-foreground">
                — checkout everything at once.
              </span>
            </p>
          </div>
        </div>
        <ProductFeed categoryId={parent.id} />
      </main>
      <FloatingCartBar />
    </div>
  );
}

function ProductFeed({ categoryId }: { categoryId: number }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { items } = useCart();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["collection-feed", categoryId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listProducts({
        data: {
          page: pageParam as number,
          perPage: 24,
          category: String(categoryId),
          orderby: "date",
        },
      }),

    getNextPageParam: (last, all) =>
      last.products.length < 24 ? undefined : all.length + 1,
    staleTime: 60_000,
  });

  // Same storefront ordering as every other grid: ready stock first, then
  // supplier stock, then out of stock.
  const products = useMemo<WooProduct[]>(
    () =>
      sortStorefrontProducts(data?.pages.flatMap((p) => p.products as WooProduct[]) ?? []),
    [data],
  );

  // Stable dep — pages count + first/last id captures "new page arrived"
  // without joining every id on each render.
  const prefetchKey = useMemo(() => {
    const n = products.length;
    if (!n) return "0";
    return `${n}:${products[0].id}:${products[n - 1].id}`;
  }, [products]);

  // O(1) cart lookup — index by (product, variation) pair, plus a
  // product-only bucket so a card can find its line before its default
  // variation has resolved.
  const byKey = useMemo(() => {
    const m = new Map<string, CartItem>();
    for (const it of items) {
      m.set(itemKey(it), it);
      const bucket = `p:${it.productId}`;
      if (!m.has(bucket)) m.set(bucket, it);
    }
    return m;
  }, [items]);

  // Warm variation cache for variable products in view.
  useEffect(() => {
    if (!products.length) return;
    const variable = products.filter(
      (p) => p.type === "variable" && (p.variations?.length ?? 0) > 0,
    );
    if (!variable.length) return;
    let cancelled = false;
    (async () => {
      const CONCURRENCY = 4;
      let i = 0;
      async function worker() {
        while (!cancelled && i < variable.length) {
          const p = variable[i++];
          try {
            await qc.ensureQueryData({
              queryKey: ["product-variations", p.id],
              queryFn: () =>
                getProductVariations({ data: { productId: p.id } }),
              staleTime: VARIATIONS_STALE_MS,
            });
          } catch {
            /* per-card query handles retries */
          }
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, variable.length) }, worker),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefetchKey, qc]);


  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (isLoading && products.length === 0) return <GridSkeleton />;

  if (isError && products.length === 0) {
    return (
      <div className="px-[5px] pt-8 pb-16 text-center">
        <PackageOpen
          className="mx-auto h-10 w-10 text-muted-foreground/40"
          strokeWidth={1.5}
        />
        <p className="mt-3 text-[13px] text-muted-foreground">
          {error instanceof Error ? error.message : "Failed to load products."}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-sm active:scale-95"
        >
          <Loader2 className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="px-[5px] pt-8 pb-16 text-center">
        <PackageOpen
          className="mx-auto h-10 w-10 text-muted-foreground/40"
          strokeWidth={1.5}
        />
        <p className="mt-3 text-[13px] text-muted-foreground">
          No products in this collection yet.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        className="grid grid-cols-4 gap-1.5 px-[5px] pt-2"
        style={{ contentVisibility: "auto", containIntrinsicSize: "800px" } as React.CSSProperties}
      >
        {products.map((p) => {
          // Simple products key exactly; variable products fall back to the
          // product bucket until the card resolves its default variation.
          const line = byKey.get(lineKey(p.id)) ?? byKey.get(`p:${p.id}`);
          return <QuickCard key={p.id} p={p} cartLine={line} />;
        })}
      </div>
      <div
        ref={sentinel}
        className="flex items-center justify-center py-6 text-muted-foreground"
      >
        {isFetchingNextPage && (
          <span className="inline-flex items-center gap-2 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading more…
          </span>
        )}
        {isError && !isFetchingNextPage && products.length > 0 && (
          <button
            type="button"
            onClick={() => fetchNextPage()}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary hover:bg-primary/15 active:scale-95"
          >
            <Loader2 className="h-3 w-3" /> Retry loading more
          </button>
        )}
        {!hasNextPage && !isError && products.length > 0 && (
          <span className="text-[10px] text-muted-foreground/70">
            End of collection ✦
          </span>
        )}
      </div>
    </>
  );
}


function FloatingCartBar() {
  const { count, subtotal, hydrated } = useCart();
  const navigate = useNavigate();
  const visible = hydrated && count > 0;

  return (
    <div
      aria-hidden={!visible}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] px-2 pb-2 transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
      }`}
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
    >
      <button
        type="button"
        onClick={() => navigate({ to: "/cart" })}
        aria-label={`View cart — ${count} ${count === 1 ? "item" : "items"}, ${formatBDT(subtotal)}`}
        className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-left text-primary-foreground shadow-xl ring-1 ring-primary/20 transition active:scale-[0.99]"
      >
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15">
          <ShoppingBag className="h-5 w-5" />
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[11px] font-extrabold text-primary shadow">
            {count > 99 ? "99+" : count}
          </span>
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[10px] uppercase tracking-wider text-white/70">
            {count} {count === 1 ? "item" : "items"} in cart
          </p>
          <p className="truncate text-[15px] font-extrabold">
            {formatBDT(subtotal)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-4 py-2 text-[12px] font-bold text-primary">
          View Cart
        </span>
      </button>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-1.5 px-[5px] pt-2">
      {Array.from({ length: 16 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-lg bg-white ring-1 ring-border/60"
        >
          <div
            className="skeleton-shimmer aspect-square"
            style={{ animationDelay: `${i * 30}ms` }}
          />
          <div className="p-1.5">
            <div className="skeleton-shimmer mx-auto h-2 w-8 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-surface-muted/40">
      <div className="h-14 border-b border-border/60 bg-background" />
      <div className="border-b border-border/60 bg-background px-[5px] py-3">
        <div className="skeleton-shimmer h-4 w-32 rounded" />
        <div className="skeleton-shimmer mt-1.5 h-2.5 w-52 rounded" />
      </div>
      <GridSkeleton />
    </div>
  );
}
