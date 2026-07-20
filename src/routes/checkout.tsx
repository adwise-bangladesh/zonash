import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Lock, ShoppingBag, Tag, Check, X, ArrowRight, Loader2 } from "lucide-react";
import { useCart } from "@/lib/cart";
import { formatBDT } from "@/lib/format";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { submitPendingOrder } from "@/lib/otp.functions";
import { collectTracking } from "@/lib/tracking";
import { getPublicPoliceStations } from "@/lib/steadfast.functions";
import { getLastOrderByPhone } from "@/lib/customer-auth.functions";
import { useCustomerSession } from "@/lib/customer-session";
import { ThanaCombobox } from "@/components/admin/ThanaCombobox";
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

const BN_DIGITS: Record<string, string> = { "০":"0","১":"1","২":"2","৩":"3","৪":"4","৫":"5","৬":"6","৭":"7","৮":"8","৯":"9" };
function normalizeBdPhone(input: string): string {
  let s = (input || "").replace(/[০-৯]/g, (d) => BN_DIGITS[d] ?? d);
  s = s.replace(/\D/g, "");
  if (/^8801[3-9]\d{8}$/.test(s)) s = "0" + s.slice(3);
  return s;
}
const isValidBdPhone = (s: string) => /^01[3-9]\d{8}$/.test(s);
const isValidName = (s: string) => {
  const t = s.trim();
  return t.length >= 2 && /\p{L}/u.test(t) && !/(.)\1{4,}/u.test(t) &&
    new Set(t.toLowerCase().split("")).size > 1;
};
const isValidAddress = (s: string) => {
  const t = s.trim();
  return t.length >= 5 && /^[\p{L}\p{N}#,\.\-\/()\s]+$/u.test(t) &&
    /\p{L}/u.test(t) && !/(.)\1{8,}/u.test(t);
};

const ERR = {
  name: "Please enter a valid full name.",
  phone: "Please enter a valid Bangladeshi mobile number (01XXXXXXXXX).",
  email: "Please enter a valid email address.",
  address: "Please enter a valid delivery address.",
  thana: "Please select your thana / upazila.",
  notes: "Delivery notes are too long.",
} as const;

const schema = z.object({
  name: z.string().max(120).refine(isValidName, ERR.name),
  phone: z.string().refine((v) => isValidBdPhone(normalizeBdPhone(v)), ERR.phone),
  email: z.string().trim().max(120).email(ERR.email).optional().or(z.literal("")),
  address: z.string().max(300).refine(isValidAddress, ERR.address),
  thana: z.string().trim().min(1, ERR.thana).max(80),
  notes: z.string().trim().max(500, ERR.notes).optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;
const EMPTY: FormData = { name: "", phone: "", email: "", address: "", thana: "", notes: "" };

const STORAGE_KEY = "zonash:checkout:form";
const COUPONS: Record<string, { label: string; type: "percent" | "flat"; value: number }> = {
  ZONASH10: { label: "10% off", type: "percent", value: 10 },
  SAVE50: { label: "50 Tk off", type: "flat", value: 50 },
};

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

function CheckoutPage() {
  const navigate = useNavigate();
  const { items, subtotal, clear, hydrated } = useCart();
  const submitFn = useServerFn(submitPendingOrder);

  const [form, setForm] = useState<FormData>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const policeFn = useServerFn(getPublicPoliceStations);
  const policeQ = useQuery({
    queryKey: ["checkout", "police-stations"],
    queryFn: () => policeFn(),
    staleTime: 24 * 60 * 60_000,
  });

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

  // Autofill from the customer's most recent order if signed in.
  const { phone: sessionPhone } = useCustomerSession();
  const lastOrderFn = useServerFn(getLastOrderByPhone);
  const lastOrderQ = useQuery({
    queryKey: ["checkout", "last-order", sessionPhone],
    enabled: !!sessionPhone,
    queryFn: () => lastOrderFn({ data: { phone: sessionPhone! } }),
    staleTime: 10 * 60_000,
  });
  useEffect(() => {
    const b = lastOrderQ.data?.billing;
    if (!b) return;
    const opts = policeQ.data?.items ?? [];
    const raw = (b.thana || "").trim();
    // Snap to a canonical option (case/whitespace-insensitive) so shipping
    // detection and the combobox recognise the value.
    const canonicalThana =
      raw && opts.length
        ? (opts.find((o) => o.toLowerCase() === raw.toLowerCase()) ?? raw)
        : raw;
    setForm((f) => ({
      name: f.name || b.name || "",
      phone: f.phone || b.phone || sessionPhone || "",
      email: f.email || b.email || "",
      address: f.address || b.address || "",
      thana: f.thana || canonicalThana || "",
      notes: f.notes || "",
    }));
  }, [lastOrderQ.data, sessionPhone, policeQ.data?.items]);


  const update = (patch: Partial<FormData>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((prev) => {
      if (!Object.keys(prev).length) return prev;
      const next = { ...prev };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  };

  // Shipping rule: 80 BDT inside Dhaka City (Steadfast district id=1), 130 BDT elsewhere.
  const dhakaCitySet = useMemo(
    () => new Set((policeQ.data?.dhakaCity ?? []).map((s) => s.trim().toLowerCase())),
    [policeQ.data?.dhakaCity],
  );
  const insideDhaka = form.thana.trim().length > 0 && dhakaCitySet.has(form.thana.trim().toLowerCase());
  const shipping = items.length === 0 ? 0 : insideDhaka ? 80 : 130;

  const coupon = useMemo(() => {
    if (!couponCode) return null;
    const c = COUPONS[couponCode];
    if (!c) return null;
    const value = c.type === "percent" ? Math.round((subtotal * c.value) / 100) : c.value;
    return { code: couponCode, discount: Math.min(value, subtotal) };
  }, [couponCode, subtotal]);
  const discount = coupon?.discount ?? 0;
  const total = useMemo(() => Math.max(0, subtotal - discount) + shipping, [subtotal, discount, shipping]);

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    if (!COUPONS[code]) { setCouponError("Invalid coupon code"); setCouponCode(null); return; }
    setCouponCode(code);
    setCouponError(null);
  };
  const removeCoupon = () => { setCouponCode(null); setCouponInput(""); setCouponError(null); };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (items.length === 0) return;
    const normalizedPhone = normalizeBdPhone(form.phone);
    const candidate = { ...form, phone: normalizedPhone };
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      setErrors(errs);
      const firstKey = parsed.error.issues[0]?.path[0] as keyof typeof ERR | undefined;
      toast.error("Please review your details", {
        description: firstKey ? ERR[firstKey] : "Some fields are invalid.",
      });
      return;
    }
    // persist normalized phone back to state
    if (normalizedPhone !== form.phone) setForm((f) => ({ ...f, phone: normalizedPhone }));
    setSubmitting(true);
    try {
      const { first, last } = splitName(parsed.data.name);
      const notePieces = [
        parsed.data.notes?.trim(),
        coupon ? `Coupon: ${coupon.code}` : undefined,
      ].filter(Boolean);

      const tracking = await collectTracking({
        name: parsed.data.name,
        email: parsed.data.email || undefined,
        phone: parsed.data.phone,
      });

      const res = await submitFn({
        data: {
          items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
          billing: {
            first_name: first,
            last_name: last || "",
            email: parsed.data.email || "",
            phone: parsed.data.phone,
            address_1: parsed.data.address,
            address_2: "",
            city: parsed.data.thana,
            country: "BD",
          },
          shipping_amount: shipping,
          shipping_label: shipping === 80 ? "Inside Dhaka" : "Outside Dhaka",
          discount,
          coupon_code: coupon?.code,
          customer_note: notePieces.length ? notePieces.join(" | ") : "",
          tracking,
        },
      });
      if (!res.ok) {
        toast.error(res.error || "Order failed");
        setSubmitting(false);
        return;
      }
      clear();
      if (!res.sms_ok) {
        toast.message("Order created", {
          description: "We couldn't text your code — tap Resend on the next screen.",
        });
      }
      navigate({
        to: "/verify-otp",
        search: {
          order: res.order_id,
          number: res.order_number,
          phone: res.phone_masked,
        } as never,
      });
    } catch (err) {
      console.error(err);
      toast.error("Could not place your order. Please try again.");
      setSubmitting(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-muted/30" aria-busy="true">
        <CheckoutHeader title="Checkout" />
        <div className="mx-auto w-full max-w-md flex-1 space-y-3 px-3 pt-3">
          <div className="h-64 animate-pulse rounded-[3px] border border-border bg-background" />
          <div className="h-14 animate-pulse rounded-[3px] border border-border bg-background" />
          <div className="h-14 animate-pulse rounded-[3px] border border-border bg-background" />
        </div>
      </div>
    );
  }

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
    <div className="flex min-h-[100dvh] flex-col bg-muted/30 pb-[132px]">
      <CheckoutHeader title="Checkout" />

      <form id="checkout-form" onSubmit={onSubmit} className="mx-auto w-full max-w-md flex-1 px-3 pt-3" autoComplete="on" name="checkout">
        {/* Delivery details */}
        <Section title="Delivery details">
          <Field label="Full name" error={errors.name}>
            <input
              name="name"
              id="checkout-name"
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              className={inputCls(errors.name)}
              autoComplete="name"
              placeholder="e.g. Rahim Uddin"
            />
          </Field>
          <Field label="Mobile number" error={errors.phone}>
            <input
              name="tel"
              id="checkout-phone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => update({ phone: normalizeBdPhone(e.target.value) })}
              placeholder="01XXXXXXXXX"
              className={inputCls(errors.phone)}
              autoComplete="tel-national"
            />
          </Field>
          <Field label="Full address" error={errors.address}>
            <textarea
              name="street-address"
              id="checkout-address"
              rows={2}
              value={form.address}
              onChange={(e) => update({ address: e.target.value })}
              className={textareaCls(errors.address)}
              autoComplete="street-address"
              placeholder="House / holding no, road, area, post office, district"
            />
          </Field>
          <Field label="Thana / Upazila" error={errors.thana}>
            <ThanaCombobox
              value={form.thana}
              onChange={(v) => update({ thana: v })}
              options={policeQ.data?.items ?? []}
              loading={policeQ.isLoading}
              buttonClassName={`flex h-11 w-full items-center justify-between gap-2 rounded-[3px] border bg-background px-3 text-left text-sm outline-none transition-colors ${errors.thana ? "border-destructive" : "border-border focus:border-primary"}`}
            />
          </Field>
          <Field label="Email (optional)" error={errors.email}>
            <input
              name="email"
              id="checkout-email"
              type="email"
              value={form.email}
              onChange={(e) => update({ email: e.target.value })}
              className={inputCls(errors.email)}
              autoComplete="email"
              placeholder="name@example.com"
            />
          </Field>
        </Section>

        {/* Delivery notes — collapsible, matches coupon/summary design */}
        <details
          open={notesOpen}
          onToggle={(e) => setNotesOpen((e.target as HTMLDetailsElement).open)}
          className="mt-3 rounded-[3px] border border-border bg-background [&[open]>summary>svg]:rotate-180"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between p-4">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ShoppingBag className="h-3.5 w-3.5" />
              {form.notes?.trim() ? "Delivery notes · added" : "Add delivery notes (optional)"}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
          </summary>
          <div className="border-t border-dashed border-border p-4 pt-3">
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => update({ notes: e.target.value })}
              className={textareaCls(errors.notes)}
              placeholder="e.g. Please call before delivery"
            />
            {errors.notes && <span className="mt-1 block text-[11px] font-semibold text-destructive">{errors.notes}</span>}
          </div>
        </details>

        {/* Coupon — collapsible */}
        <details
          open={couponOpen || !!coupon}
          onToggle={(e) => setCouponOpen((e.target as HTMLDetailsElement).open)}
          className="mt-3 rounded-[3px] border border-border bg-background [&[open]>summary>svg]:rotate-180"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between p-4">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Tag className="h-3.5 w-3.5" />
              {coupon ? `Coupon: ${coupon.code}` : "Coupon or gift card"}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
          </summary>
          <div className="border-t border-dashed border-border p-4 pt-3">
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
                    placeholder="e.g. ZONASH10"
                    className="h-10 w-full rounded-[3px] border border-border bg-background pl-8 pr-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <button type="button" onClick={applyCoupon} className="h-10 rounded-[3px] border border-primary px-3 text-sm font-semibold text-primary">
                  Apply
                </button>
              </div>
            )}
            {couponError && <p className="mt-1.5 text-[11px] font-semibold text-destructive">{couponError}</p>}
          </div>
        </details>


        {/* Order summary — collapsible, closed by default */}
        <details
          open={summaryOpen}
          onToggle={(e) => setSummaryOpen((e.target as HTMLDetailsElement).open)}
          className="mt-3 rounded-[3px] border border-border bg-background [&[open]>summary>svg]:rotate-180"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between p-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Order summary · {items.length} {items.length === 1 ? "item" : "items"}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold text-primary">{formatBDT(total)}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
            </span>
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
              <div className="flex justify-between"><dt className="text-muted-foreground">Delivery Charge</dt><dd>{shipping ? formatBDT(shipping) : "Free"}</dd></div>
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
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto w-full max-w-md px-3 pt-2.5 pb-3">
          <button
            type="submit"
            onClick={(e) => {
              const f = (e.currentTarget.closest("div")?.parentElement?.parentElement?.previousElementSibling as HTMLFormElement | null) ?? (document.querySelector("form") as HTMLFormElement | null);
              f?.requestSubmit();
            }}
            disabled={submitting}
            className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-[4px] bg-gradient-to-r from-primary via-primary to-primary/90 text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground shadow-[var(--shadow-glow)] transition-all active:scale-[0.99] disabled:opacity-60"
          >
            <span className="absolute inset-y-0 -left-16 w-16 -skew-x-12 bg-white/20 transition-transform duration-700 group-hover:translate-x-[140%]" />
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Placing your order…
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Confirm order · {formatBDT(total)}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            No online payment · Pay when you receive
          </p>
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
function textareaCls(err?: string) {
  // Slightly taller than inputs, same horizontal padding, vertical padding matched so the caret sits identically.
  return `block w-full resize-none rounded-[3px] border bg-background px-3 py-2.5 text-sm leading-5 outline-none transition-colors min-h-[56px] ${err ? "border-destructive" : "border-border focus:border-primary"}`;
}
