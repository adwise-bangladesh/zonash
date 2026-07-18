import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCart, formatMoney } from "@/lib/cart";
import { createOrder } from "@/lib/woo.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — Zonash" }, { name: "robots", content: "noindex" }] }),
  component: Checkout,
});

const formSchema = z.object({
  first_name: z.string().trim().min(1, "Required").max(60),
  last_name: z.string().trim().min(1, "Required").max(60),
  email: z.string().trim().email("Invalid email").max(200),
  phone: z.string().trim().min(3, "Required").max(30),
  address_1: z.string().trim().min(1, "Required").max(200),
  address_2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1, "Required").max(80),
  state: z.string().trim().max(80).optional(),
  postcode: z.string().trim().min(1, "Required").max(20),
  country: z.string().trim().length(2, "2-letter country code"),
});

function Checkout() {
  const { items, subtotal, clear } = useCart();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [payment, setPayment] = useState<"cod" | "bacs">("cod");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (items.length === 0) return;
    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(fd.entries());
    const parsed = formSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(`${first.path.join(".")}: ${first.message}`);
      return;
    }
    setSubmitting(true);
    const res = await createOrder({
      data: {
        items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
        billing: { ...parsed.data, address_2: parsed.data.address_2 ?? "", state: parsed.data.state ?? "" },
        payment_method: payment,
      },
    });
    setSubmitting(false);
    if (res.ok) {
      toast.success(`Order #${res.number} placed`);
      clear();
      navigate({ to: "/order-confirmed", search: { id: res.id, number: res.number } });
    } else {
      toast.error(res.error);
    }
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="mx-auto max-w-2xl px-4 py-24 text-center">
          <h1 className="font-display text-4xl">Checkout</h1>
          <p className="mt-4 text-muted-foreground">Your bag is empty.</p>
          <Link to="/products"><Button className="mt-6 rounded-none">Continue shopping</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-8 font-display text-4xl">Checkout</h1>

        <form onSubmit={onSubmit} className="grid gap-10 md:grid-cols-3">
          <div className="space-y-8 md:col-span-2">
            <section>
              <h2 className="mb-4 font-display text-xl">Contact</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" name="email" type="email" required />
                <Field label="Phone" name="phone" type="tel" required />
              </div>
            </section>

            <section>
              <h2 className="mb-4 font-display text-xl">Shipping address</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" name="first_name" required />
                <Field label="Last name" name="last_name" required />
                <Field label="Address" name="address_1" required className="sm:col-span-2" />
                <Field label="Apartment, suite (optional)" name="address_2" className="sm:col-span-2" />
                <Field label="City" name="city" required />
                <Field label="State / Region" name="state" />
                <Field label="Postal code" name="postcode" required />
                <Field label="Country (2-letter, e.g. US)" name="country" required defaultValue="US" maxLength={2} />
              </div>
            </section>

            <section>
              <h2 className="mb-4 font-display text-xl">Payment</h2>
              <div className="space-y-2">
                {[
                  { id: "cod" as const, title: "Cash on Delivery", desc: "Pay when your order arrives." },
                  { id: "bacs" as const, title: "Direct Bank Transfer", desc: "We'll email transfer details after checkout." },
                ].map((p) => (
                  <label key={p.id} className={`flex cursor-pointer items-start gap-3 border p-4 ${payment === p.id ? "border-primary bg-accent/30" : "border-border"}`}>
                    <input type="radio" name="payment" checked={payment === p.id} onChange={() => setPayment(p.id)} className="mt-1" />
                    <div>
                      <p className="font-medium">{p.title}</p>
                      <p className="text-sm text-muted-foreground">{p.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </section>
          </div>

          <aside className="h-fit border border-border p-6 md:sticky md:top-20">
            <h2 className="font-display text-xl">Order summary</h2>
            <ul className="mt-4 space-y-3">
              {items.map((it) => (
                <li key={it.productId} className="flex gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden bg-muted">
                    {it.image && <img src={it.image} alt={it.name} className="h-full w-full object-cover" />}
                  </div>
                  <div className="flex-1 text-sm">
                    <p className="line-clamp-1">{it.name}</p>
                    <p className="text-muted-foreground">Qty {it.quantity}</p>
                  </div>
                  <p className="text-sm">{formatMoney(it.price * it.quantity)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatMoney(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>Complimentary</span></div>
              <div className="mt-2 flex justify-between border-t border-border pt-3 text-base font-medium">
                <span>Total</span><span>{formatMoney(subtotal)}</span>
              </div>
            </div>
            <Button type="submit" size="lg" className="mt-6 w-full rounded-none" disabled={submitting}>
              {submitting ? "Placing order…" : "Place order"}
            </Button>
          </aside>
        </form>
      </main>
    </div>
  );
}

function Field({ label, name, className, ...rest }: { label: string; name: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <Label htmlFor={name} className="text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
      <Input id={name} name={name} className="mt-1 rounded-none" {...rest} />
    </div>
  );
}
