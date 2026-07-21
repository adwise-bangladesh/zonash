import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  useSuspenseQuery,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Loader2, LayoutGrid, ShoppingBag, Check, PackageOpen, Sparkles, Eye, X, ChevronLeft, ChevronRight, Plus, Minus, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
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

// Long stale window for variation data — variations rarely change, and
// keeping them fresh across the whole session (plus 24h in localStorage
// via query-persist) means revisits render instantly with zero API calls.
const VARIATIONS_STALE_MS = 24 * 60 * 60 * 1000;

function ProductFeed({ categoryId }: { categoryId: number | null }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
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

  // Warm the variation cache in the background for every variable product
  // in the current feed. `ensureQueryData` is a no-op when a fresh entry
  // already exists (in-memory or hydrated from localStorage), so returning
  // to the same slug is effectively free.
  const productsForPrefetch: WooProduct[] =
    data?.pages.flatMap((p) => p.products as WooProduct[]) ?? [];
  const prefetchKey = productsForPrefetch.map((p) => p.id).join(",");
  useEffect(() => {
    if (!productsForPrefetch.length) return;
    const variable = productsForPrefetch.filter(
      (p) => p.type === "variable" && (p.variations?.length ?? 0) > 0,
    );
    let cancelled = false;
    (async () => {
      // Small concurrency window keeps the API happy on large feeds.
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
            /* per-card query still handles retries + UI state */
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

/**
 * Select the WooCommerce "default" variation for display.
 *
 * Waterfall:
 *   1. Exact match on every non-empty `default_attributes` entry
 *      (empty option strings mean "Any" and are skipped).
 *   2. Best partial match — the variation matching the most defaults wins;
 *      ties broken by purchasable → in-stock → has image → has price.
 *   3. If no defaults: first purchasable + in-stock variation with a real
 *      price and image; then any in-stock; then cheapest priced; then first.
 */
function pickDefaultVariation(
  p: WooProduct,
  variations: WooVariation[],
): WooVariation | undefined {
  if (variations.length === 0) return undefined;

  const norm = (s: string) => s.toLowerCase().trim();
  const priceOf = (v: WooVariation) => {
    const sale = parseFloat(v.sale_price || "0");
    const base = parseFloat(v.price || "0");
    return sale > 0 ? sale : base;
  };
  const isPurchasable = (v: WooVariation) =>
    (v as { purchasable?: boolean }).purchasable !== false;
  const isInStock = (v: WooVariation) =>
    v.stock_status === "instock" ||
    (v as { backorders_allowed?: boolean }).backorders_allowed === true;
  const hasImage = (v: WooVariation) => !!v.image?.src;
  const hasPrice = (v: WooVariation) => priceOf(v) > 0;

  // Score a candidate for tie-breaking (higher = better).
  const quality = (v: WooVariation) =>
    (isPurchasable(v) ? 8 : 0) +
    (isInStock(v) ? 4 : 0) +
    (hasPrice(v) ? 2 : 0) +
    (hasImage(v) ? 1 : 0);

  // 1 + 2 · default_attributes-based scoring
  const defaults = (p.default_attributes ?? []).filter(
    (d) => d.option && d.option.trim() !== "",
  );

  if (defaults.length > 0) {
    let best: WooVariation | undefined;
    let bestScore = -1;
    let bestQuality = -1;

    for (const v of variations) {
      let matched = 0;
      for (const d of defaults) {
        const hit = v.attributes.some(
          (a) => norm(a.name) === norm(d.name) && norm(a.option) === norm(d.option),
        );
        if (hit) matched++;
      }
      const q = quality(v);
      if (
        matched > bestScore ||
        (matched === bestScore && q > bestQuality)
      ) {
        best = v;
        bestScore = matched;
        bestQuality = q;
      }
    }

    // Only use the match if at least one default attribute lined up.
    if (best && bestScore > 0) return best;
  }

  // 3 · No defaults (or none matched) → quality-ranked fallback.
  const ranked = [...variations].sort((a, b) => {
    const qd = quality(b) - quality(a);
    if (qd !== 0) return qd;
    // cheaper first among equally-good candidates
    return (priceOf(a) || Infinity) - (priceOf(b) || Infinity);
  });

  return ranked[0] ?? variations[0];
}


function QuickCard({ p }: { p: WooProduct }) {
  const { add, items, setQty, remove } = useCart();
  const qc = useQueryClient();
  const [state, setState] = useState<CardState>("idle");
  const [lightbox, setLightbox] = useState(false);

  const isVariable = p.type === "variable" && (p.variations?.length ?? 0) > 0;

  // Lazy-fetch variations for variable products so we can show the
  // default variation's price + image (falls back to price_html min).
  const variationsQuery = useQuery({
    queryKey: ["product-variations", p.id],
    queryFn: () => getProductVariations({ data: { productId: p.id } }),
    enabled: isVariable,
    staleTime: VARIATIONS_STALE_MS,
    gcTime: 24 * 60 * 60 * 1000,
  });

  const variationsPending = isVariable && !variationsQuery.isSuccess;

  const defaultVariation = isVariable
    ? pickDefaultVariation(p, (variationsQuery.data?.variations ?? []) as WooVariation[])
    : undefined;

  // Prices ------------------------------------------------------------
  let displayPrice: number | null = null;
  let displayRegular: number | null = null;
  if (isVariable && defaultVariation) {
    const sale = parseFloat(defaultVariation.sale_price || "0");
    const base = parseFloat(defaultVariation.price || "0");
    const regular = parseFloat(defaultVariation.regular_price || "0");
    const cur = sale > 0 ? sale : base;
    displayPrice = Number.isFinite(cur) && cur > 0 ? cur : null;
    displayRegular =
      Number.isFinite(regular) && regular > (cur || 0) ? regular : null;
  } else if (isVariable) {
    // Still loading variations — show min from price_html as a placeholder.
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

  const cardImage =
    (isVariable && defaultVariation?.image?.src) || p.images[0]?.src;
  const cardImageAlt =
    (isVariable && defaultVariation?.image?.alt) || p.images[0]?.alt || p.name;
  // Key the <img> by src so React remounts on swap, letting us
  // crossfade with a CSS transition instead of a hard jump.
  const cardImageKey = cardImage ?? "empty";

  // Track the exact cart line for this card. Variable products live under
  // their default variation's id once resolved; simple products under p.id.
  const trackedId = isVariable ? (defaultVariation?.id ?? -1) : p.id;
  const cartLine = items.find((i) => i.productId === trackedId);
  const inCart = !!cartLine;

  // Availability -----------------------------------------------------
  const productSoldOut =
    p.stock_status !== "instock" && !p.backorders_allowed;
  const productNotPurchasable =
    (p as { purchasable?: boolean }).purchasable === false;

  // For variable: once variations resolved, check the default variation.
  // If none is purchasable/in-stock → unavailable.
  const variationsLoaded = isVariable && variationsQuery.isSuccess;
  const variableUnavailable =
    variationsLoaded &&
    (!defaultVariation ||
      (defaultVariation.stock_status !== "instock" &&
        !(defaultVariation as { backorders_allowed?: boolean })
          .backorders_allowed) ||
      (defaultVariation as { purchasable?: boolean }).purchasable === false ||
      !(parseFloat(defaultVariation.price || "0") > 0 ||
        parseFloat(defaultVariation.sale_price || "0") > 0));

  const unavailable =
    productSoldOut || productNotPurchasable || variableUnavailable;

  async function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    if (state === "loading" || unavailable) return;

    try {
      if (!isVariable) {
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
        setState("loading");
        const res = await qc.ensureQueryData({
          queryKey: ["product-variations", p.id],
          queryFn: () => getProductVariations({ data: { productId: p.id } }),
          staleTime: VARIATIONS_STALE_MS,
        });
        const variations = (res?.variations ?? []) as WooVariation[];
        const v = pickDefaultVariation(p, variations);
        if (
          !v ||
          (v.stock_status !== "instock" &&
            !(v as { backorders_allowed?: boolean }).backorders_allowed) ||
          (v as { purchasable?: boolean }).purchasable === false
        ) {
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



  const unavailableLabel = productSoldOut ? "Sold out" : "Unavailable";

  return (
    <div
      role="button"
      tabIndex={unavailable ? -1 : 0}
      onClick={(e) => handleAdd(e as unknown as React.MouseEvent)}
      onKeyDown={(e) => {
        if (unavailable) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleAdd(e as unknown as React.MouseEvent);
        }
      }}
      aria-disabled={unavailable}
      aria-label={
        unavailable ? `${p.name} — ${unavailableLabel}` : `Add ${p.name} to cart`
      }
      className={`group relative flex flex-col overflow-hidden rounded-lg bg-white text-left shadow-sm ring-1 ring-border/60 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
        unavailable
          ? "cursor-not-allowed opacity-95"
          : "cursor-pointer active:scale-[0.97]"
      }`}
    >
      <div className="relative aspect-square overflow-hidden bg-surface-muted">
        {cardImage ? (
          <img
            key={cardImageKey}
            src={cardImage}
            alt={cardImageAlt}
            loading="lazy"
            decoding="async"
            className={`h-full w-full animate-fade-in object-cover transition-transform duration-300 ${
              unavailable
                ? "scale-100 grayscale-[0.4] opacity-60"
                : "group-hover:scale-105"
            }`}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground/40">
            <ShoppingBag className="h-5 w-5" />
          </div>
        )}

        {/* Skeleton shimmer while variation data is still loading —
            prevents the image/price from visibly jumping on swap. */}
        {variationsPending && !unavailable && (
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-br from-white/50 via-white/10 to-transparent" />
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

        {/* Preview (eye) — top-left, no background */}
        {state === "idle" && (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Preview ${p.name} images`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLightbox(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                setLightbox(true);
              }
            }}
            className="absolute left-1 top-1 grid h-6 w-6 cursor-pointer place-items-center rounded-full text-white transition-transform hover:scale-110 active:scale-95 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.55))]"
          >
            <Eye className="h-4 w-4" strokeWidth={2.5} />
          </span>
        )}

        {/* Quantity stepper — bottom of image when in cart */}
        {state === "idle" && inCart && cartLine && !unavailable && (
          <div
            className="absolute inset-x-1 bottom-1 flex animate-fade-in items-center justify-between gap-1 rounded-full bg-primary/95 px-1 py-1 text-primary-foreground shadow-lg ring-1 ring-primary/30 backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label={
                cartLine.quantity <= 1 ? "Remove from cart" : "Decrease quantity"
              }
              onClick={(e) => {
                e.stopPropagation();
                if (cartLine.quantity <= 1) remove(trackedId);
                else setQty(trackedId, cartLine.quantity - 1);
              }}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 active:scale-90"
            >
              {cartLine.quantity <= 1 ? (
                <Trash2 className="h-3 w-3" strokeWidth={2.5} />
              ) : (
                <Minus className="h-3 w-3" strokeWidth={3} />
              )}
            </button>
            <span
              className="min-w-[16px] text-center text-[11px] font-extrabold leading-none tabular-nums"
              aria-live="polite"
            >
              {cartLine.quantity}
            </span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={(e) => {
                e.stopPropagation();
                setQty(trackedId, cartLine.quantity + 1);
              }}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 active:scale-90"
            >
              <Plus className="h-3 w-3" strokeWidth={3} />
            </button>
          </div>
        )}


        {unavailable && (
          <>
            <span className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="rotate-[-8deg] rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-lg ring-1 ring-white/10">
                {unavailableLabel}
              </span>
            </span>
            <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wider text-white">
              {unavailableLabel}
            </span>
          </>
        )}
      </div>

      <div className="flex items-baseline justify-center gap-1 px-1 py-1.5">
        {variationsPending ? (
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className="block h-2.5 w-10 animate-pulse rounded-sm bg-muted-foreground/20" />
            <span className="block h-2 w-6 animate-pulse rounded-sm bg-muted-foreground/10" />
          </span>
        ) : displayPrice != null ? (
          <span className="flex animate-fade-in items-baseline gap-1">
            <span className={`text-[11px] font-extrabold leading-none ${unavailable ? "text-muted-foreground line-through" : "text-primary"}`}>
              {formatBDT(displayPrice)}
            </span>
            {displayRegular != null && (
              <span className="text-[9px] leading-none text-muted-foreground line-through">
                {formatBDT(displayRegular)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </div>


      {lightbox && (
        <Lightbox
          title={p.name}
          images={p.images.length > 0 ? p.images : cardImage ? [{ src: cardImage, alt: cardImageAlt }] : []}
          onClose={() => setLightbox(false)}
        />
      )}
    </div>

  );
}

/* -------------------- Lightbox -------------------- */

function Lightbox({
  title,
  images,
  onClose,
}: {
  title: string;
  images: { src: string; alt?: string }[];
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const total = images.length;
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((v) => (v + 1) % Math.max(total, 1));
      if (e.key === "ArrowLeft") setI((v) => (v - 1 + Math.max(total, 1)) % Math.max(total, 1));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [total, onClose]);

  if (typeof document === "undefined") return null;
  if (total === 0) return null;

  const go = (dir: 1 | -1) => setI((v) => (v + dir + total) % total);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} images`}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      {/* Header — rendered with z-20 so it sits above the slides layer;
          otherwise the full-size slides div would swallow clicks on the
          close (X) button. */}
      <div
        className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-white">{title}</p>
          <p className="text-[10px] uppercase tracking-wider text-white/60">
            {i + 1} / {total}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close preview"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/25 transition hover:bg-white/25 active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>
      </div>


      {/* Slides */}
      <div
        className="relative z-10 h-full w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touchX.current = null;
        }}
      >
        <div
          className="flex h-full w-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${i * 100}%)` }}
        >
          {images.map((img, idx) => (
            <div
              key={idx}
              className="flex h-full w-full shrink-0 items-center justify-center px-4 py-16"
            >
              <img
                src={img.src}
                alt={img.alt || `${title} ${idx + 1}`}
                className="max-h-full max-w-full rounded-xl object-contain shadow-2xl animate-scale-in"
                draggable={false}
              />
            </div>
          ))}
        </div>

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20 active:scale-95"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20 active:scale-95"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Dots */}
      {total > 1 && (
        <div
          className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setI(idx)}
              aria-label={`Go to image ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                idx === i ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"
              }`}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
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
