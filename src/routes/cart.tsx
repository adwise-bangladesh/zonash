import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, ArrowRight, ChevronDown, Lock, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { MAX_QTY, itemKey, lineKey, useCart, type CartItem } from "@/lib/cart";
import { repriceCartLines } from "@/lib/woo.functions";
import { formatBDT } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";

/** Max ids the reprice server function accepts per call. */
const REPRICE_CHUNK = 50;
type RepricedLine = Awaited<ReturnType<typeof repriceCartLines>>["lines"][number];

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your bag — Zonash" },
      { name: "description", content: "Review the pieces in your Zonash bag and continue to checkout." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CartPage,
  errorComponent: CartError,
});

function CartError() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/30">
      <CheckoutHeader title="My Cart" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-3 pt-3">
        <EmptyState
          icon={ShoppingBag}
          title="We couldn't load your bag"
          description="Something went wrong while opening your cart. Please try again."
          primary={{ label: "Reload", onClick: () => window.location.reload() }}
          secondary={{ label: "Continue shopping", to: "/products" }}
        />
      </div>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/30 pb-[112px]" aria-busy="true" aria-live="polite">
      <CheckoutHeader title="My Cart" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-3 pt-3">
        <span className="sr-only">Loading your bag…</span>
        <ul className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex gap-2.5 rounded-[3px] border border-border bg-background p-2.5">
              <div className="h-16 w-16 shrink-0 animate-pulse rounded-[3px] bg-muted" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="h-3 w-4/5 animate-pulse rounded-[2px] bg-muted" />
                <div className="h-3 w-3/5 animate-pulse rounded-[2px] bg-muted" />
                <div className="mt-auto flex items-center justify-between pt-1.5">
                  <div className="h-4 w-16 animate-pulse rounded-[2px] bg-muted" />
                  <div className="h-7 w-24 animate-pulse rounded-[3px] bg-muted" />
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 h-14 animate-pulse rounded-[3px] border border-border bg-background" />
      </div>
      <div
        className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-x border-t border-border bg-background/95 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto w-full max-w-md px-3 pt-2.5 pb-3">
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[4px] bg-muted text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground"
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            Loading…
          </button>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            No online payment · Pay when you receive
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * One bag line. Memoised on the item identity plus the two stable callbacks,
 * so bumping the quantity of one line never re-renders the rest of the bag.
 */
const CartRow = memo(function CartRow({
  item,
  status,
  stockQty,
  onSetQty,
  onRemove,
}: {
  item: CartItem;
  /** Availability reported by the last server reprice. */
  status?: "oos" | "gone";
  /** Remaining units when the store tracks stock for this line. */
  stockQty?: number | null;
  onSetQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
}) {

  const lineTotal = item.price * item.quantity;
  const hasOld = !!item.regularPrice && item.regularPrice > item.price;
  const lineOld = hasOld ? item.regularPrice! * item.quantity : 0;
  const lineSave = hasOld ? lineOld - lineTotal : 0;
  const pct = hasOld && lineOld > 0 ? Math.round((lineSave / lineOld) * 100) : 0;
  const cap = typeof stockQty === "number" && stockQty > 0 ? Math.min(MAX_QTY, stockQty) : MAX_QTY;
  const atMax = item.quantity >= cap;
  const overStock = item.quantity > cap;


  const thumb = item.image ? (
    <img
      // Keyed by src: React would otherwise reuse the same DOM node when the
      // line's image changes, and the imperative `visibility:hidden` set by a
      // single transient load failure would stick to the new image forever.
      key={item.image}
      src={item.image}
      alt=""
      width={64}
      height={64}
      className="h-full w-full object-cover"
      loading="lazy"
      decoding="async"
      onLoad={(e) => {
        e.currentTarget.style.visibility = "";
      }}
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />

  ) : (
    <span className="block h-full w-full bg-muted" />
  );

  return (
    <li
      className={`flex gap-2.5 rounded-[3px] border bg-background p-2.5 ${
        status || overStock ? "border-destructive/40" : "border-border"
      }`}
    >


      <Link
        to="/products/$slug"
        params={{ slug: item.slug }}
        className="h-16 w-16 shrink-0 overflow-hidden rounded-[3px] bg-muted"
        aria-label={item.name}
      >
        {thumb}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-2">
          <Link
            to="/products/$slug"
            params={{ slug: item.slug }}
            className="line-clamp-2 flex-1 text-[13px] font-medium text-foreground"
          >
            {item.name}
          </Link>
          <button
            type="button"
            aria-label={`Remove ${item.name}`}
            onClick={() => onRemove(itemKey(item))}
            className="-mr-1 -mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[3px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        {item.sku && (
          <div className="text-[10.5px] leading-tight text-muted-foreground">
            SKU: <span className="font-mono">{item.sku}</span>
          </div>
        )}
        {status ? (
          <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-destructive">
            <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
            {status === "gone"
              ? "No longer available — remove to continue"
              : "Out of stock — remove to continue"}
          </p>
        ) : overStock ? (
          <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-destructive">
            <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
            Only {cap} left — reduce the quantity to continue
          </p>
        ) : atMax && cap < MAX_QTY ? (
          <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-500">
            Last {cap} in stock
          </p>
        ) : null}


        <div className="mt-auto flex items-center justify-between pt-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-primary tabular-nums">{formatBDT(lineTotal)}</span>
            {hasOld ? (
              <>
                <span className="text-[11px] text-muted-foreground line-through tabular-nums">
                  {formatBDT(lineOld)}
                </span>
                <span className="rounded-[2px] bg-destructive/10 px-1 py-[1px] text-[9px] font-bold text-destructive">
                  -{pct}%
                </span>
              </>
            ) : null}
          </div>
          <div className="flex items-center rounded-[3px] bg-secondary shadow-[var(--shadow-soft)]">
            <button
              type="button"
              aria-label={
                item.quantity <= 1
                  ? `Remove ${item.name}`
                  : `Decrease quantity of ${item.name}`
              }
              onClick={() => onSetQty(itemKey(item), item.quantity - 1)}
              className="grid h-7 w-7 place-items-center text-muted-foreground active:scale-95"
            >
              <Minus className="h-3 w-3" aria-hidden="true" />
            </button>
            <span className="w-7 text-center text-xs font-semibold tabular-nums">
              <span className="sr-only">Quantity: </span>
              {item.quantity}
            </span>
            <button
              type="button"
              aria-label={`Increase quantity of ${item.name}`}
              onClick={() => onSetQty(itemKey(item), item.quantity + 1)}
              disabled={atMax}
              aria-disabled={atMax}
              className="grid h-7 w-7 place-items-center text-primary active:scale-95 disabled:opacity-40"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
});

function CartPage() {
  const { items, subtotal, setQty, remove, repriceMany, hydrated } = useCart();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Warm the checkout screen while the customer is still reading their bag.
  // `preload="intent"` only fires on hover/touchstart — on a phone that is the
  // tap itself, so the route chunk download lands *inside* the navigation and
  // the transition stutters. Fetching the chunk up front makes the tap render
  // instantly, like a native push.
  const hasItems = hydrated && items.length > 0;
  useEffect(() => {
    if (!hasItems) return;
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback
        : (cb: () => void) => window.setTimeout(cb, 200);
    const id = idle(() => {
      router.preloadRoute({ to: "/checkout" }).catch(() => {});
    });
    return () => {
      if (typeof window.cancelIdleCallback === "function" && typeof id === "number") {
        window.cancelIdleCallback(id);
      }
    };
  }, [hasItems, router]);



  // `setQty` already clamps to [0, MAX_QTY] and drops the line at 0, so the
  // page keeps no clamping rules of its own.
  const onSetQty = useCallback(
    (key: string, qty: number) => setQty(key, qty),
    [setQty],
  );
  const onRemove = useCallback((key: string) => remove(key), [remove]);

  // Bag prices are snapshots. Re-check them against WooCommerce once the bag
  // is hydrated so the customer never sees a price that checkout will change.
  const repriceFn = useServerFn(repriceCartLines);
  // Only the *set* of lines matters. Sorting keeps the key stable when the
  // customer reorders or when quantities change, so tapping "+" no longer
  // risks a fresh server round-trip.
  const repriceKeys = useMemo(
    () => Array.from(new Set(items.map(itemKey))).sort(),
    [items],
  );
  const lineIds = repriceKeys.join(",");
  const { data: repriced } = useQuery({
    queryKey: ["cart-reprice", lineIds],
    queryFn: async ({ signal }) => {
      // The server function accepts 50 ids per call while the bag holds up to
      // MAX_LINES, so the whole bag is covered in chunks; the server memo +
      // single-flight make repeat chunks nearly free. Chunks run concurrently
      // (bounded) instead of serially, and one failing chunk must not erase
      // the availability gate for the chunks that succeeded.
      const chunks: string[][] = [];
      for (let i = 0; i < repriceKeys.length; i += REPRICE_CHUNK) {
        chunks.push(repriceKeys.slice(i, i + REPRICE_CHUNK));
      }
      const settled = await Promise.allSettled(
        chunks.map((chunk) =>
          repriceFn({
            signal,
            data: {
              lines: chunk.map((k) => {
                const [p, v] = k.split(":");
                const productId = Number(p);
                const variationId = Number(v);
                return {
                  productId,
                  variationId: variationId > 0 ? variationId : undefined,
                };
              }),
            },
          }),
        ),
      );
      const lines: RepricedLine[] = [];
      for (const r of settled) {
        if (r.status !== "fulfilled") continue;
        // The response crosses an untrusted boundary; only accept the shape
        // the UI actually reads.
        const got = Array.isArray(r.value?.lines) ? r.value.lines : [];
        for (const l of got) {
          if (l && Number.isFinite(l.productId)) lines.push(l);
        }
      }
      return { lines };
    },
    enabled: hydrated && repriceKeys.length > 0,
    staleTime: 60_000,
    // A bag left open in a background tab goes stale; re-check availability
    // when the customer comes back rather than sending them to checkout with
    // an hour-old stock snapshot.
    refetchOnWindowFocus: true,
    // Removing one line changes the query key. Without carrying the previous
    // result forward the availability gate blinks off mid-refetch and the
    // Checkout button becomes clickable with a ghost line still in the bag.
    placeholderData: keepPreviousData,
    retry: 0,
  });


  const [priceChanged, setPriceChanged] = useState(false);
  // The notice belongs to one bag composition; a later bag must not inherit it.
  useEffect(() => setPriceChanged(false), [lineIds]);
  // Reconcile in one pass and one state commit. The previous version did an
  // O(lines x bag) `find` and fired a separate setState per changed line.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (!repriced?.lines) return;
    const bag = new Map<string, CartItem>(itemsRef.current.map((i) => [itemKey(i), i] as const));
    const updates: { key: string; price: number; regularPrice?: number }[] = [];
    for (const l of repriced.lines) {
      if (typeof l.price !== "number" || !(l.price > 0)) continue;
      const key = lineKey(l.productId, l.variationId ?? undefined);
      const cur = bag.get(key);
      if (!cur) continue;
      if (cur.price !== l.price || (cur.regularPrice ?? 0) !== (l.regularPrice ?? 0)) {
        updates.push({ key, price: l.price, regularPrice: l.regularPrice ?? undefined });
      }
    }
    if (updates.length === 0) return;
    repriceMany(updates);
    setPriceChanged(true);
  }, [repriced, repriceMany]);


  // Availability + remaining stock, derived in a single pass over the server
  // response rather than three separate walks. A line that is out of stock or
  // gone cannot be ordered, so it must surface here rather than failing inside
  // WooCommerce order creation after the customer has typed their address.
  const { blocked, stockCaps } = useMemo(() => {
    const blockedMap = new Map<string, "oos" | "gone">();
    const caps = new Map<string, number>();
    for (const l of repriced?.lines ?? []) {
      const key = lineKey(l.productId, l.variationId ?? undefined);
      if (l.gone || !l.inStock) {
        blockedMap.set(key, l.gone ? "gone" : "oos");
        continue;
      }
      if (typeof l.stockQty === "number" && l.stockQty > 0) caps.set(key, l.stockQty);
    }
    return { blocked: blockedMap, stockCaps: caps };
  }, [repriced]);
  const blockedCount = useMemo(
    () => items.reduce((n, i) => n + (blocked.has(itemKey(i)) ? 1 : 0), 0),
    [items, blocked],
  );

  const overStockKeys = useMemo(() => {
    const out: { key: string; cap: number }[] = [];
    for (const i of items) {
      const key = itemKey(i);
      if (blocked.has(key)) continue;
      const cap = stockCaps.get(key);
      if (cap !== undefined && i.quantity > cap) out.push({ key, cap });
    }
    return out;
  }, [items, stockCaps, blocked]);

  // The "unavailable items" CTA used to be a disabled dead end: it told the
  // customer what to do but could not do it. It now performs the fix.
  const resolveIssues = useCallback(() => {
    for (const i of itemsRef.current) {
      const key = itemKey(i);
      if (blocked.has(key)) remove(key);
    }
    for (const { key, cap } of overStockKeys) setQty(key, cap);
  }, [blocked, overStockKeys, remove, setQty]);

  const issueCount = blockedCount + overStockKeys.length;


  const savings = useMemo(

    () =>
      Math.max(
        0,
        items.reduce(
          (s, i) =>
            s + ((i.regularPrice && i.regularPrice > i.price ? i.regularPrice : i.price) - i.price) * i.quantity,
          0,
        ),
      ),
    [items],
  );

  if (!hydrated) return <CartSkeleton />;

  if (items.length === 0) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-muted/30">
        <CheckoutHeader title="My Cart" />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-3 pt-3">
          <EmptyState
            icon={ShoppingBag}
            title="Your bag is empty"
            description="Browse pieces you love and tap Add to cart to start."
            primary={{ label: "Continue shopping", to: "/products" }}
            secondary={{ label: "Browse categories", to: "/categories" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/30 pb-[112px]">
      <CheckoutHeader title="My Cart" count={items.length} />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-3 pt-3">
        {priceChanged && (
          <p
            role="status"
            className="mb-2.5 rounded-[3px] border border-border bg-background px-3 py-2 text-[11.5px] text-muted-foreground"
          >
            Some prices were updated to the latest store price.
          </p>
        )}
        {issueCount > 0 && (
          <p
            role="alert"
            className="mb-2.5 rounded-[3px] border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11.5px] font-medium text-destructive"
          >
            {issueCount === 1 ? "1 item needs" : `${issueCount} items need`} attention before
            checkout — {blockedCount > 0 ? "some are unavailable" : "stock is limited"}.
          </p>
        )}

        <ul className="space-y-2.5">
          {items.map((item) => {
            const key = itemKey(item);
            return (
              <CartRow
                key={key}
                item={item}
                status={blocked.get(key)}
                stockQty={stockCaps.get(key) ?? null}
                onSetQty={onSetQty}
                onRemove={onRemove}
              />
            );
          })}

        </ul>


        <details className="mt-4 rounded-[3px] border border-border bg-background [&[open]>summary>span>svg]:rotate-180">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Order summary · {items.length} {items.length === 1 ? "item" : "items"}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold text-primary">{formatBDT(subtotal)}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" aria-hidden="true" />
            </span>
          </summary>
          <dl className="space-y-2 border-t border-dashed border-border px-4 pb-4 pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-medium tabular-nums">{formatBDT(subtotal)}</dd>
            </div>
            {savings > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">You save</dt>
                <dd className="font-semibold tabular-nums text-destructive">−{formatBDT(savings)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Delivery Charge</dt>
              <dd className="text-[12px] font-medium text-muted-foreground">Calculated at checkout</dd>
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-border pt-3">
              <dt className="text-sm font-semibold">Total</dt>
              <dd className="text-xl font-bold tabular-nums text-primary">{formatBDT(subtotal)}</dd>
            </div>
          </dl>
        </details>

        {savings > 0 ? (
          <p className="mt-2 text-center text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            🎉 You&apos;re saving {formatBDT(savings)} on this order
          </p>
        ) : null}

        <div className="h-4" />
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-x border-t border-border bg-background/95 backdrop-blur-md shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto w-full max-w-md px-3 pt-2.5 pb-3">
          {issueCount > 0 ? (
            <button
              type="button"
              onClick={resolveIssues}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[4px] bg-destructive text-sm font-bold uppercase tracking-[0.08em] text-destructive-foreground transition-all active:scale-[0.99]"
            >
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              {blockedCount > 0 && overStockKeys.length > 0
                ? "Fix bag to continue"
                : blockedCount > 0
                  ? `Remove unavailable ${blockedCount === 1 ? "item" : "items"}`
                  : "Adjust quantities to available stock"}
            </button>
          ) : (

            <Link
              to="/checkout"
              preload="intent"
              viewTransition
              className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-[4px] bg-gradient-to-r from-primary via-primary to-primary/90 text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground shadow-[var(--shadow-glow)] transition-transform duration-150 active:scale-[0.97]"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 -left-16 w-16 -skew-x-12 bg-white/20 transition-transform duration-700 group-hover:translate-x-[140%]"
              />
              <Lock className="h-4 w-4" aria-hidden="true" />
              Checkout · {formatBDT(subtotal)}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          )}

          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            No online payment · Pay when you receive
          </p>
        </div>
      </div>
    </div>
  );
}
