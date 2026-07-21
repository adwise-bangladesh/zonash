import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  useSuspenseQuery,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Loader2, LayoutGrid, ShoppingBag, Check, PackageOpen, Sparkles } from "lucide-react";
import {
  getCategoryWithSubs,
  listProducts,
  getProductVariations,
} from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatBDT } from "@/lib/format";
import { parsePriceHtmlMin } from "@/lib/price-range";
import { useCart } from "@/lib/cart";
import type { WooProduct, WooVariation } from "@/lib/woo.server";

const categoryQuery = (slug: string) =>
  queryOptions({
    queryKey: ["collection-page", slug],
    queryFn: () => getCategoryWithSubs({ data: { slug } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/collection/$slug")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(categoryQuery(params.slug)),
  head: ({ params }) => {
    const pretty = params.slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    return {
      meta: [
        { title: `${pretty} — Quick Shop | Zonash` },
        {
          name: "description",
          content: `Tap to add — shop the entire ${pretty} collection in seconds.`,
        },
        { property: "og:title", content: `${pretty} — Quick Shop | Zonash` },
        {
          property: "og:description",
          content: `Tap to add — shop the entire ${pretty} collection in seconds.`,
        },
      ],
    };
  },
  component: CollectionQuickShop,
  pendingComponent: PageSkeleton,
  errorComponent: ({ error }) => (
    <Shell>
      <EmptyState
        icon={LayoutGrid}
        title="Couldn't load this collection"
        description={error.message}
      />
    </Shell>
  ),
  notFoundComponent: () => (
    <Shell>
      <EmptyState
        icon={LayoutGrid}
        title="Collection not found"
        description="This category doesn't exist yet."
        primary={{ label: "Browse all", to: "/products" }}
      />
    </Shell>
  ),
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-muted/40">
      <AppHeader />
      <main className="container-page py-6">{children}</main>
    </div>
  );
}

function CollectionQuickShop() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(categoryQuery(slug));
  const parent = data.parent;

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
        <ProductFeed categoryId={parent?.id ?? null} />
      </main>
      <FloatingCartBar />
    </div>
  );
}

/* -------------------- Product Feed (4-col strict) -------------------- */

function ProductFeed({ categoryId }: { categoryId: number | null }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const enabled = !!categoryId;

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ["collection-feed", categoryId],
      enabled,
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

  const products: WooProduct[] =
    data?.pages.flatMap((p) => p.products as WooProduct[]) ?? [];

  if (!enabled) {
    return (
      <div className="px-[5px] pt-6">
        <EmptyState
          icon={LayoutGrid}
          title="Collection unavailable"
          description="This collection isn't set up yet."
        />
      </div>
    );
  }

  if (isLoading && products.length === 0) return <GridSkeleton />;

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
      <div className="grid grid-cols-4 gap-1.5 px-[5px] pt-2">
        {products.map((p) => (
          <QuickCard key={p.id} p={p} />
        ))}
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
        {!hasNextPage && products.length > 0 && (
          <span className="text-[10px] text-muted-foreground/70">
            End of collection ✦
          </span>
        )}
      </div>
    </>
  );
}

/* -------------------- Quick Card -------------------- */

type CardState = "idle" | "loading" | "added";

function QuickCard({ p }: { p: WooProduct }) {
  const { add, items } = useCart();
  const qc = useQueryClient();
  const [state, setState] = useState<CardState>("idle");

  const isVariable = p.type === "variable" && (p.variations?.length ?? 0) > 0;

  // Prices ------------------------------------------------------------
  let displayPrice: number | null = null;
  let displayRegular: number | null = null;
  if (isVariable) {
    const range = parsePriceHtmlMin(p.price_html);
    displayPrice = range.sale ?? range.regular;
    displayRegular = range.regular && range.sale ? range.regular : null;
  } else {
    const sale = p.on_sale && p.sale_price ? parseFloat(p.sale_price) : NaN;
    const reg = parseFloat(p.regular_price || p.price || "0");
    const cur = !Number.isNaN(sale) ? sale : parseFloat(p.price || "0");
    displayPrice = Number.isFinite(cur) && cur > 0 ? cur : null;
    displayRegular =
      p.on_sale && Number.isFinite(reg) && reg > (cur || 0) ? reg : null;
  }

  const inCart = items.some((i) => i.productId === (p.id || -1));

  async function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    if (state === "loading") return;

    try {
      if (!isVariable) {
        // Simple product — add straight away.
        const price =
          p.on_sale && p.sale_price
            ? parseFloat(p.sale_price)
            : parseFloat(p.price || "0");
        const regular = parseFloat(p.regular_price || "0");
        add({
          productId: p.id,
          name: p.name,
          slug: p.slug,
          sku: p.sku,
          price: Number.isFinite(price) && price > 0 ? price : 0,
          regularPrice:
            Number.isFinite(regular) && regular > 0 ? regular : undefined,
          image: p.images[0]?.src,
        });
      } else {
        // Variable — silently pick the first in-stock variation.
        setState("loading");
        const res = await qc.ensureQueryData({
          queryKey: ["product-variations", p.id],
          queryFn: () => getProductVariations({ data: { productId: p.id } }),
          staleTime: 5 * 60 * 1000,
        });
        const variations = (res?.variations ?? []) as WooVariation[];
        const v =
          variations.find((x) => x.stock_status === "instock") ??
          variations[0];
        if (!v) {
          setState("idle");
          return;
        }
        const salePrice = parseFloat(v.sale_price || "0");
        const price = salePrice > 0 ? salePrice : parseFloat(v.price || "0");
        const regular = parseFloat(v.regular_price || "0");
        add({
          productId: v.id,
          name: p.name,
          slug: p.slug,
          sku: v.sku || p.sku,
          price: Number.isFinite(price) && price > 0 ? price : 0,
          regularPrice:
            Number.isFinite(regular) && regular > (price || 0)
              ? regular
              : undefined,
          image: v.image?.src || p.images[0]?.src,
        });
      }
      setState("added");
      setTimeout(() => setState("idle"), 1100);
    } catch {
      setState("idle");
    }
  }

  return (
    <button
      type="button"
      onClick={handleAdd}
      aria-label={`Add ${p.name} to cart`}
      className="group relative flex flex-col overflow-hidden rounded-lg bg-white text-left shadow-sm ring-1 ring-border/60 transition-all duration-200 active:scale-[0.97]"
    >
      <div className="relative aspect-square overflow-hidden bg-surface-muted">
        {p.images[0] ? (
          <img
            src={p.images[0].src}
            alt={p.images[0].alt || p.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground/40">
            <ShoppingBag className="h-5 w-5" />
          </div>
        )}

        {/* Overlay state */}
        {state === "loading" && (
          <div className="absolute inset-0 grid place-items-center bg-black/40">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        )}
        {state === "added" && (
          <div className="absolute inset-0 grid animate-fade-in place-items-center bg-primary/85">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white shadow-md">
              <Check
                className="h-5 w-5 text-primary"
                strokeWidth={3}
              />
            </span>
          </div>
        )}

        {/* Persistent in-cart tick */}
        {state === "idle" && inCart && (
          <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}

        {p.stock_status !== "instock" && !p.backorders_allowed && (
          <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[9px] font-semibold text-white">
            Sold out
          </span>
        )}
      </div>

      <div className="flex items-baseline justify-center gap-1 px-1 py-1.5">
        {displayPrice != null ? (
          <>
            {isVariable && (
              <span className="text-[9px] font-medium leading-none text-muted-foreground">
                from
              </span>
            )}
            <span className="text-[11px] font-extrabold leading-none text-primary">
              {formatBDT(displayPrice)}
            </span>
            {displayRegular != null && (
              <span className="text-[9px] leading-none text-muted-foreground line-through">
                {formatBDT(displayRegular)}
              </span>
            )}
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </div>
    </button>
  );
}

/* -------------------- Floating Cart Bar -------------------- */

function FloatingCartBar() {
  const { count, subtotal, hydrated } = useCart();
  const navigate = useNavigate();
  const visible = hydrated && count > 0;

  return (
    <div
      aria-hidden={!visible}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] px-2 pb-2 transition-all duration-300 ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-full opacity-0"
      }`}
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-xl ring-1 ring-primary/20">
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
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigate({ to: "/cart" })}
          className="h-9 shrink-0 rounded-full bg-white px-4 text-[12px] font-bold text-primary hover:bg-white/90"
        >
          View Cart
        </Button>
      </div>
    </div>
  );
}

/* -------------------- Skeletons -------------------- */

function GridSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-1.5 px-[5px] pt-2">
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg bg-white ring-1 ring-border/60">
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
