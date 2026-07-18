import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useCart, formatMoney } from "@/lib/cart";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Cart — Zonash" }, { name: "robots", content: "noindex" }] }),
  component: CartPage,
});

function CartPage() {
  const { items, subtotal, setQty, remove } = useCart();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-8 font-display text-4xl">Your bag</h1>

        {items.length === 0 ? (
          <div className="border border-dashed border-border py-24 text-center">
            <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">Your bag is empty.</p>
            <Link to="/products"><Button className="mt-6 rounded-none">Continue shopping</Button></Link>
          </div>
        ) : (
          <div className="grid gap-10 md:grid-cols-3">
            <div className="md:col-span-2">
              <ul className="divide-y divide-border border-y border-border">
                {items.map((it) => (
                  <li key={it.productId} className="flex gap-4 py-5">
                    <Link to="/products/$slug" params={{ slug: it.slug }} className="h-24 w-24 shrink-0 overflow-hidden bg-muted">
                      {it.image && <img src={it.image} alt={it.name} className="h-full w-full object-cover" />}
                    </Link>
                    <div className="flex flex-1 flex-col">
                      <div className="flex justify-between gap-4">
                        <Link to="/products/$slug" params={{ slug: it.slug }} className="text-sm font-medium hover:underline">{it.name}</Link>
                        <button onClick={() => remove(it.productId)} className="text-muted-foreground hover:text-destructive" aria-label="Remove">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{formatMoney(it.price)}</p>
                      <div className="mt-auto flex items-center justify-between">
                        <div className="flex items-center border border-border">
                          <button onClick={() => setQty(it.productId, it.quantity - 1)} className="p-2 hover:bg-accent"><Minus className="h-3 w-3" /></button>
                          <span className="w-10 text-center text-sm">{it.quantity}</span>
                          <button onClick={() => setQty(it.productId, it.quantity + 1)} className="p-2 hover:bg-accent"><Plus className="h-3 w-3" /></button>
                        </div>
                        <p className="text-sm font-medium">{formatMoney(it.price * it.quantity)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <aside className="h-fit border border-border p-6">
              <h2 className="font-display text-xl">Order summary</h2>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatMoney(subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>Complimentary</span></div>
                <div className="mt-4 flex justify-between border-t border-border pt-4 text-base font-medium">
                  <span>Total</span><span>{formatMoney(subtotal)}</span>
                </div>
              </div>
              <Link to="/checkout"><Button className="mt-6 w-full rounded-none" size="lg">Checkout</Button></Link>
              <Link to="/products" className="mt-3 block text-center text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
                Continue shopping
              </Link>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
