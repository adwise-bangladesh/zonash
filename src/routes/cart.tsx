import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, ChevronDown, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/lib/cart";
import { formatBDT } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your bag — Zonash" },
      { name: "description", content: "Review the pieces in your Zonash bag and continue to checkout." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { items, subtotal, setQty, remove } = useCart();
  const total = subtotal;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/30 pb-16">
      <CheckoutHeader title="My Bag" count={items.length} />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-3 pt-3">
        {items.length === 0 ? (
          <EmptyCart />
        ) : (
          <>
            <ul className="space-y-2.5">
              {items.map((item) => (
                <li key={item.productId} className="flex gap-2.5 rounded-[3px] border border-border bg-background p-2.5">
                  <Link to="/products/$slug" params={{ slug: item.slug }} className="h-16 w-16 shrink-0 overflow-hidden rounded-[3px] bg-muted">
                    {item.image ? (
                      <img src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" />
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
                        aria-label="Remove"
                        onClick={() => remove(item.productId)}
                        className="-mr-1 -mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[3px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-1.5">
                      <span className="text-sm font-bold text-primary">{formatBDT(item.price * item.quantity)}</span>
                      <div className="flex items-center rounded-[3px] bg-secondary shadow-[var(--shadow-soft)]">
                        <button
                          aria-label="Decrease"
                          onClick={() => setQty(item.productId, item.quantity - 1)}
                          className="grid h-7 w-7 place-items-center text-muted-foreground active:scale-95"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-7 text-center text-xs font-semibold">{item.quantity}</span>
                        <button
                          aria-label="Increase"
                          onClick={() => setQty(item.productId, item.quantity + 1)}
                          className="grid h-7 w-7 place-items-center text-primary active:scale-95"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <details open className="group mt-4 rounded-[3px] border border-border bg-background [&[open]>summary>svg]:rotate-180">
              <summary className="flex cursor-pointer list-none items-center justify-between p-4">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order summary</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
              </summary>
              <dl className="space-y-2 px-4 pb-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="font-medium">{formatBDT(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Shipping</dt>
                  <dd className="text-[12px] font-medium text-muted-foreground">Estimated in checkout</dd>
                </div>
                <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-border pt-3">
                  <dt className="text-sm font-semibold">Total</dt>
                  <dd className="text-xl font-bold text-primary">{formatBDT(total)}</dd>
                </div>
              </dl>
            </details>

            <div className="h-4" />
          </>
        )}
      </div>

      {items.length > 0 && (
        <div
          className="sticky bottom-16 z-20 mt-auto border-t border-border bg-background/95 px-3 py-2.5 backdrop-blur"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
        >
          <Link
            to="/checkout"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[3px] bg-primary text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-[var(--shadow-glow)] active:scale-[0.99]"
          >
            Checkout • {formatBDT(total)} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

function EmptyCart() {
  return (
    <EmptyState
      icon={ShoppingBag}
      title="Your bag is empty"
      description="Browse pieces you love and tap Add to cart to start."
      primary={{ label: "Continue shopping", to: "/products" }}
      secondary={{ label: "Browse categories", to: "/categories" }}
    />
  );
}
