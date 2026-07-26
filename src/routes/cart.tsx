import { createFileRoute, Link } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, ArrowRight, ChevronDown, Lock, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { MAX_QTY, itemKey, lineKey, useCart, type CartItem } from "@/lib/cart";
import { repriceCartLines } from "@/lib/woo.functions";
import { formatBDT } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";

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
  onSetQty,
  onRemove,
}: {
  item: CartItem;
  /** Availability reported by the last server reprice. */
  status?: "oos" | "gone";
  onSetQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
}) {

  const lineTotal = item.price * item.quantity;
  const hasOld = !!item.regularPrice && item.regularPrice > item.price;
  const lineOld = hasOld ? item.regularPrice! * item.quantity : 0;
  const lineSave = hasOld ? lineOld - lineTotal : 0;
  const pct = hasOld && lineOld > 0 ? Math.round((lineSave / lineOld) * 100) : 0;
  const atMax = item.quantity >= MAX_QTY;

  const thumb = item.image ? (
    <img
      src={item.image}
      alt=""
      width={64}
      height={64}
      className="h-full w-full object-cover"
      loading="lazy"
      decoding="async"
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
        status ? "border-destructive/40" : "border-border"
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
            <span
              aria-label={`Quantity ${item.quantity}`}
              className="w-7 text-center text-xs font-semibold tabular-nums"
            >
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
  const { items, subtotal, setQty, remove, repriceLine, hydrated } = useCart();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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
  const lineIds = useMemo(
    () => items.map((i) => `${i.productId}:${i.variationId ?? 0}`).join(","),
    [items],
  );
  const { data: repriced } = useQuery({
    queryKey: ["cart-reprice", lineIds],
    queryFn: () =>
      repriceFn({
        data: {
          lines: items.slice(0, 50).map((i) => ({
            productId: i.productId,
            variationId: i.variationId,
          })),
        },
      }),
    enabled: hydrated && items.length > 0,
    staleTime: 60_000,
    retry: 0,
  });

  const [priceChanged, setPriceChanged] = useState(false);
  useEffect(() => {
    if (!repriced?.lines) return;
    let changed = false;
    for (const l of repriced.lines) {
      if (l.price == null) continue;
      const key = lineKey(l.productId, l.variationId ?? undefined);
      const cur = items.find((i) => itemKey(i) === key);
      if (!cur) continue;
      if (cur.price !== l.price || (cur.regularPrice ?? 0) !== (l.regularPrice ?? 0)) {
        changed = true;
        repriceLine(key, l.price, l.regularPrice ?? undefined);
      }
    }
    if (changed) setPriceChanged(true);
    // `items` is intentionally excluded — repriceLine is a no-op when the line
    // already matches, and including it would loop on every write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repriced, repriceLine]);

  // Availability reported by the server. A line that is out of stock or gone
  // cannot be ordered, so it must be surfaced here rather than failing inside
  // WooCommerce order creation after the customer has typed their address.
  const blocked = useMemo(() => {
    const m = new Map<string, "oos" | "gone">();
    for (const l of repriced?.lines ?? []) {
      if (!l.gone && l.inStock) continue;
      m.set(lineKey(l.productId, l.variationId ?? undefined), l.gone ? "gone" : "oos");
    }
    return m;
  }, [repriced]);
  const blockedCount = blocked.size;



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
        {blockedCount > 0 && (
          <p
            role="alert"
            className="mb-2.5 rounded-[3px] border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11.5px] font-medium text-destructive"
          >
            {blockedCount === 1 ? "1 item is" : `${blockedCount} items are`} unavailable. Remove{" "}
            {blockedCount === 1 ? "it" : "them"} to continue to checkout.
          </p>
        )}
        <ul className="space-y-2.5">
          {items.map((item) => (
            <CartRow
              key={itemKey(item)}
              item={item}
              status={blocked.get(itemKey(item))}
              onSetQty={onSetQty}
              onRemove={onRemove}
            />
          ))}
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
          <Link
            to="/checkout"
            preload="intent"
            className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-[4px] bg-gradient-to-r from-primary via-primary to-primary/90 text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground shadow-[var(--shadow-glow)] transition-all active:scale-[0.99]"
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 -left-16 w-16 -skew-x-12 bg-white/20 transition-transform duration-700 group-hover:translate-x-[140%]"
            />
            <Lock className="h-4 w-4" aria-hidden="true" />
            Checkout · {formatBDT(subtotal)}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            No online payment · Pay when you receive
          </p>
        </div>
      </div>
    </div>
  );
}
