import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { ArrowRight, ChevronDown, Lock, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/lib/cart";
import { formatBDT } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";

const MAX_QTY = 99;

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your bag — Zonash" },
      { name: "description", content: "Review the pieces in your Zonash bag and continue to checkout." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CartPage,
});

function CartSkeleton() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/30 pb-[112px]" aria-busy="true" aria-live="polite">
      <CheckoutHeader title="My Bag" />
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
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md"
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

function CartPage() {
  const { items, subtotal, setQty, remove, hydrated } = useCart();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { regularTotal, savings, grandTotal } = useMemo(() => {
    const regular = items.reduce(
      (s, i) => s + (i.regularPrice && i.regularPrice > i.price ? i.regularPrice : i.price) * i.quantity,
      0,
    );
    return {
      regularTotal: regular,
      savings: Math.max(0, regular - subtotal),
      grandTotal: subtotal,
    };
  }, [items, subtotal]);

  if (items.length === 0) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-muted/30">
        <CheckoutHeader title="My Bag" />
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
      <CheckoutHeader title="My Bag" count={items.length} />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-3 pt-3">
        <ul className="space-y-2.5">
          {items.map((item) => {
            const lineTotal = item.price * item.quantity;
            const hasOld = !!item.regularPrice && item.regularPrice > item.price;
            const lineOld = hasOld ? item.regularPrice! * item.quantity : 0;
            const lineSave = hasOld ? lineOld - lineTotal : 0;
            const pct = hasOld ? Math.round((lineSave / lineOld) * 100) : 0;
            return (
              <li
                key={item.productId}
                className="flex gap-2.5 rounded-[3px] border border-border bg-background p-2.5"
              >
                <Link
                  to="/products/$slug"
                  params={{ slug: item.slug }}
                  className="h-16 w-16 shrink-0 overflow-hidden rounded-[3px] bg-muted"
                  aria-label={item.name}
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt=""
                      width={64}
                      height={64}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="block h-full w-full bg-muted" />
                  )}
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
                      onClick={() => remove(item.productId)}
                      className="-mr-1 -mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[3px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-1.5">
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
                        aria-label="Decrease quantity"
                        onClick={() => setQty(item.productId, item.quantity - 1)}
                        className="grid h-7 w-7 place-items-center text-muted-foreground active:scale-95"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span
                        aria-live="polite"
                        aria-label={`Quantity ${item.quantity}`}
                        className="w-7 text-center text-xs font-semibold tabular-nums"
                      >
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() => setQty(item.productId, Math.min(MAX_QTY, item.quantity + 1))}
                        disabled={item.quantity >= MAX_QTY}
                        className="grid h-7 w-7 place-items-center text-primary active:scale-95 disabled:opacity-40"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
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
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
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
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto w-full max-w-md px-3 pt-2.5 pb-3">
          <Link
            to="/checkout"
            className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-[4px] bg-gradient-to-r from-primary via-primary to-primary/90 text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground shadow-[var(--shadow-glow)] transition-all active:scale-[0.99]"
          >
            <span className="absolute inset-y-0 -left-16 w-16 -skew-x-12 bg-white/20 transition-transform duration-700 group-hover:translate-x-[140%]" />
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
