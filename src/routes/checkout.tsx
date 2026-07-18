import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Lock, ShoppingBag, Tag, Check, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { formatBDT } from "@/lib/format";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { createOrder } from "@/lib/woo.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Zonash" },
      { name: "description", content: "Enter your delivery details to place your Zonash order." },
    ],
  }),
  component: CheckoutPage,
});

const schema = z.object({
  first_name: z.string().trim().min(1, "Enter your first name").max(60),
  last_name: z.string().trim().min(1, "Enter your last name").max(60),
  email: z.string().trim().email("Invalid email").max(120),
  phone: z.string().trim().regex(/^(\+?88)?01[3-9]\d{8}$/, "Enter a valid Bangladeshi mobile number"),
  address_1: z.string().trim().min(5, "Address is too short").max(200),
  city: z.string().trim().min(1, "City is required").max(80),
  postcode: z.string().trim().min(3, "Postcode is required").max(20),
});

type FormData = z.infer<typeof schema>;
const EMPTY: FormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  address_1: "",
  city: "Dhaka",
  postcode: "",
};

const STORAGE_KEY = "zonash:checkout:form";
const COUPONS: Record<string, { label: string; type: "percent" | "flat"; value: number }> = {
  ZONASH10: { label: "10% off", type: "percent", value: 10 },
  SAVE50: { label: "৳50 off", type: "flat", value: 50 },
};

function CheckoutPage() {
  const navigate = useNavigate();
  const { items, subtotal, clear } = useCart();
  const createOrderFn = useServerFn(createOrder);

  const [form, setForm] = useState<FormData>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [payment, setPayment] = useState<"cod" | "bacs">("cod");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Hydrate saved form on client only
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setForm({ ...EMPTY, ...JSON.parse(raw) });
    } catch { /* ignore */ }
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(form)); } catch { /* ignore */ }
  }, [form]);

  const update = (patch: Partial<FormData>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((prev) => {
      if (!Object.keys(prev).length) return prev;
      const next = { ...prev };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  };

  const shipping = items.length === 0 ? 0 : form.city.trim().toLowerCase() === "dhaka" ? 80 : 130;
  const discount = useMemo(() => (coupon ? Math.min(coupon.discount, subtotal) : 0), [coupon, subtotal]);
  const total = Math.max(0, subtotal - discount) + shipping;

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    const c = COUPONS[code];
    if (!c) {
      setCouponError("Invalid coupon code");
      setCoupon(null);
      return;
    }
    const value = c.type === "percent" ? Math.round((subtotal * c.value) / 100) : c.value;
    setCoupon({ code, discount: value });
    setCouponError(null);
  };
  const removeCoupon = () => {
    setCoupon(null);
    setCouponInput("");
    setCouponError(null);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (items.length === 0) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      const res = await createOrderFn({
        data: {
          items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
          billing: {
            first_name: parsed.data.first_name,
            last_name: parsed.data.last_name,
            email: parsed.data.email,
            phone: parsed.data.phone,
            address_1: parsed.data.address_1,
            address_2: "",
            city: parsed.data.city,
            state: "",
            postcode: parsed.data.postcode,
            country: "BD",
          },
          payment_method: payment,
          customer_note: coupon ? `Coupon: ${coupon.code}` : undefined,
        },
      });
      if (!res.ok) {
        toast.error(res.error || "Order failed");
        setSubmitting(false);
        return;
      }
      clear();
      navigate({ to: "/order-confirmed", search: { number: String(res.number), total: res.total } as never });
    } catch (err) {
      console.error(err);
      toast.error("Could not place your order. Please try again.");
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-muted/30">
        <CheckoutHeader title="Checkout" />
        <EmptyState
          icon={ShoppingBag}
          title="Your bag is empty"
          description="Add pieces to your bag before checking out."
          primary={{ label: "Continue shopping", to: "/products" }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/30 pb-24">
      <CheckoutHeader title="Checkout" />

      <form onSubmit={onSubmit} className="mx-auto w-full max-w-md flex-1 px-3 pt-3">
        {/* Contact */}
        <Section title="Contact">
          <Grid2>
            <Field label="First name" error={errors.first_name}>
              <input value={form.first_name} onChange={(e) => update({ first_name: e.target.value })} className={inputCls(errors.first_name)} autoComplete="given-name" />
            </Field>
            <Field label="Last name" error={errors.last_name}>
              <input value={form.last_name} onChange={(e) => update({ last_name: e.target.value })} className={inputCls(errors.last_name)} autoComplete="family-name" />
            </Field>
          </Grid2>
          <Field label="Email" error={errors.email}>
            <input type="email" value={form.email} onChange={(e) => update({ email: e.target.value })} className={inputCls(errors.email)} autoComplete="email" />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <input inputMode="tel" value={form.phone} onChange={(e) => update({ phone: e.target.value })} placeholder="01XXXXXXXXX" className={inputCls(errors.phone)} autoComplete="tel" />
          </Field>
        </Section>

        {/* Shipping */}
        <Section title="Shipping address">
          <Field label="Address" error={errors.address_1}>
            <textarea rows={2} value={form.address_1} onChange={(e) => update({ address_1: e.target.value })} className={inputCls(errors.address_1) + " resize-none"} autoComplete="street-address" />
          </Field>
          <Grid2>
            <Field label="City" error={errors.city}>
              <input value={form.city} onChange={(e) => update({ city: e.target.value })} className={inputCls(errors.city)} autoComplete="address-level2" />
            </Field>
            <Field label="Postcode" error={errors.postcode}>
              <input value={form.postcode} onChange={(e) => update({ postcode: e.target.value })} className={inputCls(errors.postcode)} autoComplete="postal-code" />
            </Field>
          </Grid2>
        </Section>

        {/* Payment */}
        <Section title="Payment method">
          <div className="space-y-2">
            <PayOption id="cod" active={payment === "cod"} onSelect={() => setPayment("cod")} label="Cash on Delivery" sub="Pay in cash when your order arrives" />
            <PayOption id="bacs" active={payment === "bacs"} onSelect={() => setPayment("bacs")} label="Bank Transfer" sub="We'll email you our bank details" />
          </div>
        </Section>

        {/* Coupon */}
        <Section title="Coupon">
          {coupon ? (
            <div className="flex items-center justify-between rounded-[3px] bg-success/10 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 font-semibold text-success">
                <Check className="h-4 w-4" /> {coupon.code} applied
              </span>
              <button type="button" onClick={removeCoupon} aria-label="Remove coupon" className="grid h-6 w-6 place-items-center rounded-full hover:bg-background">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="Enter code"
                  className="h-10 w-full rounded-[3px] border border-border bg-background pl-8 pr-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <button type="button" onClick={applyCoupon} className="h-10 rounded-[3px] border border-primary px-3 text-sm font-semibold text-primary">
                Apply
              </button>
            </div>
          )}
          {couponError && <p className="mt-1.5 text-[11px] font-semibold text-destructive">{couponError}</p>}
        </Section>

        {/* Order summary */}
        <details open className="group mt-3 rounded-[3px] border border-border bg-background [&[open]>summary>svg]:rotate-180">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order summary · {items.length} items</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
          </summary>
          <div className="border-t border-dashed border-border">
            <ul className="divide-y divide-border/60 px-4">
              {items.map((i) => (
                <li key={i.productId} className="flex gap-2.5 py-3">
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-[3px] bg-muted">
                    {i.image && <img src={i.image} alt="" className="h-full w-full object-cover" />}
                  </span>
                  <div className="min-w-0 flex-1 text-[12px]">
                    <Link to="/products/$slug" params={{ slug: i.slug }} className="line-clamp-2 font-medium">{i.name}</Link>
                    <div className="mt-0.5 text-muted-foreground">Qty {i.quantity}</div>
                  </div>
                  <div className="text-[13px] font-bold text-primary">{formatBDT(i.price * i.quantity)}</div>
                </li>
              ))}
            </ul>
            <dl className="space-y-2 px-4 pb-4 pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{formatBDT(subtotal)}</dd></div>
              {discount > 0 && <div className="flex justify-between text-success"><dt>Discount</dt><dd>-{formatBDT(discount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd>{shipping ? formatBDT(shipping) : "Free"}</dd></div>
              <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-border pt-3">
                <dt className="text-sm font-semibold">Total</dt>
                <dd className="text-xl font-bold text-primary">{formatBDT(total)}</dd>
              </div>
            </dl>
          </div>
        </details>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3" /> Secure checkout · Encrypted end-to-end
        </p>
      </form>

      <div
        className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background/95 px-3 py-2.5 backdrop-blur"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
      >
        <div className="mx-auto flex w-full max-w-md items-center gap-3">
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</div>
            <div className="text-lg font-extrabold text-primary">{formatBDT(total)}</div>
          </div>
          <button
            type="submit"
            form=""
            onClick={(e) => {
              const f = (e.currentTarget.closest("div")?.parentElement?.previousElementSibling as HTMLFormElement | null) ?? (document.querySelector("form") as HTMLFormElement | null);
              f?.requestSubmit();
            }}
            disabled={submitting}
            className="h-11 flex-[2] rounded-[3px] bg-primary text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-[var(--shadow-glow)] active:scale-[0.99] disabled:opacity-60"
          >
            {submitting ? "Placing order…" : "Place order"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3 rounded-[3px] border border-border bg-background p-4 first:mt-0">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}
function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
}
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
      {error && <span className="mt-1 block text-[11px] font-semibold text-destructive">{error}</span>}
    </label>
  );
}
function inputCls(err?: string) {
  return `h-10 w-full rounded-[3px] border bg-background px-3 text-sm outline-none transition-colors ${err ? "border-destructive" : "border-border focus:border-primary"}`;
}
function PayOption({ id, label, sub, active, onSelect }: { id: string; label: string; sub: string; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`flex w-full items-center gap-3 rounded-[3px] border p-3 text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-border bg-background"}`}
    >
      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${active ? "border-primary" : "border-muted-foreground"}`}>
        {active && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{sub}</span>
      </span>
      <span className="text-[10px] font-semibold uppercase text-muted-foreground">{id.toUpperCase()}</span>
    </button>
  );
}
