import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Inbox,
  Loader2,
  LogOut,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  ShieldCheck,
  StickyNote,
  Sparkles,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { AuthHero, OtpBoxes } from "@/components/checkout/AuthUi";
import { useCustomerSession } from "@/lib/customer-session";

import {
  listOrdersByPhone,
  requestCustomerLoginOtp,
  verifyCustomerLoginOtp,
} from "@/lib/customer-auth.functions";
import { formatBDT } from "@/lib/format";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "My orders — Zonash" },
      {
        name: "description",
        content: "Sign in with your mobile number to view your Zonash orders.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const { phone, ready, setPhone, logout } = useCustomerSession();
  if (!ready) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!phone) return <PhoneLoginGate onSignedIn={setPhone} />;
  return <SignedInOrders phone={phone} onLogout={logout} />;
}

// ============================================================
// Login gate — app-style, matches the /support design language
// ============================================================

/** Digits only, drop a leading 880 / 0 so we always keep the 10-digit national part. */
function toNational(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("880")) d = d.slice(3);
  while (d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
}
const NATIONAL_RE = /^1[3-9]\d{8}$/;

function PhoneLoginGate({ onSignedIn }: { onSignedIn: (p: string) => void }) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [national, setNational] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const requestFn = useServerFn(requestCustomerLoginOtp);
  const verifyFn = useServerFn(verifyCustomerLoginOtp);
  const codeRef = useRef<HTMLInputElement>(null);

  const valid = NATIONAL_RE.test(national);
  const fullPhone = `0${national}`;
  const prettyPhone = national
    ? `+880 ${national.slice(0, 4)} ${national.slice(4)}`.trim()
    : "your number";

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const sendCode = async (resend = false) => {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await requestFn({ data: { phone: fullPhone } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStep("otp");
      setCooldown(60);
      setCode("");
      setTimeout(() => codeRef.current?.focus(), 60);
      if (resend) toast.success("New code sent");
    } catch {
      setError("Could not send code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = useCallback(
    async (full: string) => {
      if (full.length !== 4 || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await verifyFn({ data: { phone: fullPhone, code: full } });
        if (!res.ok) {
          setError(res.error);
          setCode("");
          codeRef.current?.focus();
          return;
        }
        onSignedIn(res.phone);
        toast.success("Signed in");
      } catch {
        setError("Verification failed. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [busy, fullPhone, verifyFn, onSignedIn],
  );

  useEffect(() => {
    if (step === "otp" && code.length === 4 && !busy) void verify(code);
  }, [code, step, busy, verify]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <CheckoutHeader title={step === "phone" ? "Sign in" : "Verify code"} />

      <main className="mx-auto w-full max-w-[480px] flex-1 px-3 pb-10 pt-3">
        <AuthHero
          icon={step === "phone" ? Package : ShieldCheck}
          title={step === "phone" ? "Track your orders" : "Enter verification code"}
          subtitle={
            step === "phone"
              ? "Sign in with your mobile number — no password needed."
              : `We texted a 4-digit code to ${prettyPhone}.`
          }
          step={step === "phone" ? 1 : 2}
        />

        {step === "phone" ? (
          <section className="mt-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <label
              htmlFor="orders-phone"
              className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Mobile number
            </label>
            <div
              className={`mt-1.5 flex items-stretch overflow-hidden rounded-2xl border transition-colors ${
                error ? "border-destructive/60" : "border-border focus-within:border-primary"
              } bg-background`}
            >
              <span className="grid select-none place-items-center border-r border-border bg-muted/60 px-3 text-[14px] font-semibold text-muted-foreground">
                +880
              </span>
              <input
                id="orders-phone"
                type="tel"
                inputMode="numeric"
                value={national}
                onChange={(e) => {
                  setNational(toNational(e.target.value));
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendCode(false);
                }}
                placeholder="1926644575"
                autoComplete="tel-national"
                aria-label="Mobile number without country code"
                aria-invalid={!!error}
                className="h-12 min-w-0 flex-1 bg-transparent px-3.5 text-[15px] font-medium tracking-[0.02em] tabular-nums outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground/60"
              />
              {valid && (
                <span className="grid place-items-center pr-3 text-primary" aria-hidden="true">
                  <CheckCircle2 className="h-4.5 w-4.5" />
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              10 digits after +880 — a leading 0 is removed automatically.
            </p>
            {error && <p className="mt-2 text-[12px] font-medium text-destructive">{error}</p>}
            <button
              onClick={() => sendCode(false)}
              disabled={busy || !valid}
              className={`mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-[13px] font-semibold text-primary-foreground shadow-sm transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Send code <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
              <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                We only use your number to look up your orders. No password, no spam.
              </p>
            </div>
          </section>
        ) : (
          <section className="mt-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <OtpBoxes
              inputRef={codeRef}
              code={code}
              busy={busy}
              error={!!error}
              onChange={(v) => {
                setCode(v);
                if (error) setError(null);
              }}
            />
            <div className="mt-3 min-h-[18px] text-center text-[12px]">
              {error ? (
                <span className="font-medium text-destructive">{error}</span>
              ) : busy ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-primary" aria-hidden="true" />
                  Auto-detects when SMS arrives
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setCode("");
                  setError(null);
                }}
                className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-secondary text-[13px] font-semibold text-secondary-foreground transition-transform active:scale-[0.99] ${focusRing}`}
              >
                Change number
              </button>
              <button
                type="button"
                onClick={() => sendCode(true)}
                disabled={cooldown > 0 || busy}
                className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-primary/10 text-[13px] font-semibold text-primary transition-transform active:scale-[0.99] disabled:bg-muted disabled:text-muted-foreground ${focusRing}`}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {cooldown > 0 ? `${cooldown}s` : "Resend"}
              </button>
            </div>
          </section>
        )}

        <Link
          to="/products"
          preload="intent"
          className={`mt-6 flex h-11 items-center justify-center rounded-full bg-secondary text-[13px] font-semibold text-secondary-foreground transition-transform active:scale-[0.99] ${focusRing}`}
        >
          Continue shopping
        </Link>
      </main>
    </div>
  );
}



// ============================================================
// Orders list — cart-style header + real data + real timeline
// ============================================================

type OrderRow = Awaited<ReturnType<typeof listOrdersByPhone>>["orders"][number];

const STATUS_STYLES: Record<string, { label: string; chip: string; dot: string }> = {
  pending: { label: "Pending", chip: "bg-amber-500/12 text-amber-700 border-amber-500/25", dot: "bg-amber-500" },
  "on-hold": { label: "On hold", chip: "bg-amber-500/12 text-amber-700 border-amber-500/25", dot: "bg-amber-500" },
  processing: { label: "Processing", chip: "bg-sky-500/12 text-sky-700 border-sky-500/25", dot: "bg-sky-500" },
  confirmed: { label: "Confirmed", chip: "bg-sky-500/12 text-sky-700 border-sky-500/25", dot: "bg-sky-500" },
  shipped: { label: "Shipped", chip: "bg-indigo-500/12 text-indigo-700 border-indigo-500/25", dot: "bg-indigo-500" },
  completed: { label: "Delivered", chip: "bg-emerald-500/12 text-emerald-700 border-emerald-500/25", dot: "bg-emerald-500" },
  cancelled: { label: "Cancelled", chip: "bg-rose-500/10 text-rose-700 border-rose-500/20", dot: "bg-rose-500" },
  refunded: { label: "Refunded", chip: "bg-rose-500/10 text-rose-700 border-rose-500/20", dot: "bg-rose-500" },
  failed: { label: "Failed", chip: "bg-rose-500/10 text-rose-700 border-rose-500/20", dot: "bg-rose-500" },
};

function statusMeta(s: string) {
  return (
    STATUS_STYLES[s] ?? {
      label: s.replace(/-/g, " "),
      chip: "bg-muted text-foreground/70 border-border",
      dot: "bg-muted-foreground",
    }
  );
}

function StatusChip({ status }: { status: string }) {
  const m = statusMeta(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${m.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function SignedInOrders({ phone, onLogout }: { phone: string; onLogout: () => void }) {
  const listFn = useServerFn(listOrdersByPhone);
  const [openOrder, setOpenOrder] = useState<OrderRow | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const query = useInfiniteQuery({
    queryKey: ["customer-orders-infinite", phone],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listFn({ data: { phone, page: pageParam as number, perPage: 15 } }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 30_000,
  });

  const orders = useMemo(
    () => query.data?.pages.flatMap((p) => p.orders) ?? [],
    [query.data],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
          void query.fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [query]);

  const firstError = query.data?.pages[0]?.error;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background pb-20">
      <CheckoutHeader title="My Orders" count={orders.length} />

      <main className="mx-auto w-full max-w-[480px] flex-1 px-3 pb-6 pt-3">
        {/* Account card */}
        <section className="relative flex items-center gap-3 overflow-hidden rounded-2xl bg-primary px-3.5 py-3.5 text-primary-foreground shadow-sm ring-1 ring-inset ring-primary-foreground/10">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-primary-foreground/10"
          />
          <span
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-foreground/15 ring-1 ring-inset ring-primary-foreground/20"
            aria-hidden="true"
          >
            <Phone className="h-4 w-4" />
          </span>
          <div className="relative min-w-0 flex-1">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-primary-foreground/70">
              Signed in as
            </div>
            <div className="truncate font-display text-[15px] font-bold tabular-nums">
              +880 {phone.replace(/^0/, "")}
            </div>
          </div>

          <button
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            aria-label="Refresh orders"
            className={`relative grid h-10 w-10 place-items-center rounded-full bg-primary-foreground/15 text-primary-foreground transition-transform active:scale-95 disabled:opacity-50 ${focusRing}`}
          >
            <RefreshCw
              className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </button>
          <button
            onClick={onLogout}
            aria-label="Sign out"
            className={`relative grid h-10 w-10 place-items-center rounded-full bg-primary-foreground/15 text-primary-foreground transition-transform active:scale-95 ${focusRing}`}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </section>

        <div className="mt-5 flex items-center justify-between px-1">
          <h2 className="text-[13px] font-semibold">Order history</h2>
          {orders.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
              {orders.length}
            </span>
          )}
        </div>


        <div className="mt-2">
          {query.isLoading ? (
            <ul className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <li
                  key={i}
                  className="h-[116px] animate-pulse rounded-2xl border border-border bg-card"
                />
              ))}
            </ul>
          ) : firstError || query.isError ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
              <p className="text-[13px] text-muted-foreground">
                {firstError ?? "Could not load your orders."}
              </p>
              <button
                onClick={() => query.refetch()}
                className={`mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-secondary px-4 text-[13px] font-semibold text-secondary-foreground ${focusRing}`}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
                <Inbox className="h-6 w-6" aria-hidden="true" />
              </div>
              <p className="text-[14px] font-semibold">No orders yet</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                When you place an order, it will appear here.
              </p>
              <Link
                to="/products"
                preload="intent"
                className={`mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground ${focusRing}`}
              >
                Start shopping <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <>
              <ul className="space-y-2">
                {orders.map((o) => (
                  <OrderCard key={o.id} order={o} onOpen={() => setOpenOrder(o)} />
                ))}
              </ul>
              <div ref={sentinelRef} className="h-10" />
              {query.isFetchingNextPage && (
                <div className="flex justify-center py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
              {!query.hasNextPage && orders.length > 6 && (
                <p className="mt-4 text-center text-[11.5px] text-muted-foreground">
                  You're all caught up · {orders.length} orders
                </p>
              )}
            </>
          )}
        </div>
      </main>


      <OrderDetailSheet order={openOrder} onClose={() => setOpenOrder(null)} />
    </div>
  );
}

function OrderCard({ order, onOpen }: { order: OrderRow; onOpen: () => void }) {
  const items = order.line_items ?? [];
  const first = items[0];
  const image = first?.image?.src;
  const rest = Math.max(0, items.length - 1);
  const itemCount = items.reduce((n, li) => n + (li.quantity ?? 1), 0);
  const city = order.shipping?.city || order.billing?.city;

  return (
    <li>
      <button
        onClick={onOpen}
        aria-label={`Order ${order.number}`}
        className={`group flex w-full items-stretch gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition-transform active:scale-[0.99] ${focusRing}`}
      >
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
          {image ? (
            <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Package className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-semibold text-muted-foreground">
              #{order.number} · {formatDate(order.date_created)}
            </span>
            <StatusChip status={order.status} />
          </div>
          <p className="mt-0.5 line-clamp-1 text-[13px] font-medium">
            {first?.name ?? "Order"}
            {rest > 0 && (
              <span className="text-muted-foreground"> + {rest} more</span>
            )}
          </p>
          {first?.sku && (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
              SKU · {first.sku}
            </p>
          )}
          <div className="mt-auto flex items-end justify-between pt-1">
            <span className="line-clamp-1 text-[11px] text-muted-foreground">
              {itemCount} item{itemCount !== 1 ? "s" : ""}
              {city ? ` · ${city}` : ""}
            </span>
            <span className="inline-flex items-center gap-1 text-[14px] font-bold text-primary">
              {formatBDT(Number(order.total))}
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </button>
    </li>
  );
}

// ============================================================
// Order detail sheet with real-data timeline
// ============================================================

function OrderDetailSheet({ order, onClose }: { order: OrderRow | null; onClose: () => void }) {
  return (
    <Sheet open={!!order} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
        {order && <OrderDetailBody order={order} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

type TimelineStep = { key: string; label: string; hint: string; at: string | null; icon: typeof Clock };

function buildTimeline(order: OrderRow): { steps: TimelineStep[]; activeIndex: number; cancelled: boolean } {
  const cancelled = ["cancelled", "failed", "refunded"].includes(order.status);
  const created = order.date_created;
  const modified = order.date_modified ?? null;
  const paid = order.date_paid ?? null;
  const completed = order.date_completed ?? null;

  // Milestone reached if status has passed it. Woo doesn't store per-step timestamps,
  // so we mark reached steps with the best available timestamp (paid / modified / completed).
  const order_of: Record<string, number> = {
    pending: 0,
    "on-hold": 0,
    confirmed: 1,
    processing: 2,
    shipped: 3,
    completed: 4,
  };
  const idx = order_of[order.status] ?? (cancelled ? 0 : 0);

  const steps: TimelineStep[] = [
    { key: "placed", label: "Order placed", hint: "We received your order", at: created, icon: CheckCircle2 },
    { key: "confirmed", label: "Confirmed", hint: "Verified & ready to pack", at: idx >= 1 ? (paid ?? modified) : null, icon: ShieldCheck },
    { key: "processing", label: "Processing", hint: "Packing your items", at: idx >= 2 ? modified : null, icon: Package },
    { key: "shipped", label: "Shipped", hint: "Handed to courier", at: idx >= 3 ? modified : null, icon: Truck },
    { key: "completed", label: "Delivered", hint: "Enjoy your order", at: completed, icon: Sparkles },
  ];
  return { steps, activeIndex: idx, cancelled };
}

function OrderDetailBody({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const m = statusMeta(order.status);
  const { steps, activeIndex, cancelled } = buildTimeline(order);
  const items = order.line_items ?? [];
  const shippingTotal = Number(order.shipping_total ?? 0);
  const discount = Number(order.discount_total ?? 0);
  const total = Number(order.total ?? 0);
  const itemsSubtotal = items.reduce((n, li) => n + Number(li.subtotal ?? li.total ?? 0), 0);
  const shippingMethod = order.shipping_lines?.[0]?.method_title;
  const shipTo = order.shipping ?? order.billing ?? {};
  const addressLines = [
    [shipTo.first_name, shipTo.last_name].filter(Boolean).join(" "),
    shipTo.address_1,
    shipTo.address_2,
    [shipTo.city, shipTo.state].filter(Boolean).join(", "),
  ].filter(Boolean) as string[];

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background text-foreground/70 transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Order
            </div>
            <div className="font-display text-[15px] font-semibold tracking-tight">
              #{order.number}
            </div>
          </div>
          <span className="h-9 w-9" aria-hidden />
        </div>
      </div>

      <div className="flex-1 space-y-3 px-3 py-3">
        {/* Hero status */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-4">
          <div className="flex items-center justify-between">
            <StatusChip status={order.status} />
            <span className="text-[11.5px] text-muted-foreground">
              Placed {formatDateTime(order.date_created)}
            </span>
          </div>
          <p className="mt-2 text-[13px] font-medium">
            {cancelled
              ? "This order was not completed."
              : order.status === "completed"
                ? "Your order was delivered. Thanks for shopping with Zonash."
                : order.status === "pending" || order.status === "on-hold"
                  ? "We're verifying your order. You'll get an SMS as it progresses."
                  : "Your order is moving through fulfilment."}
          </p>
        </div>

        {/* Timeline */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Status timeline
          </div>
          <ol className="relative space-y-4">
            {steps.map((step, i) => {
              const isDone = !cancelled && i <= activeIndex;
              const isCurrent = !cancelled && i === activeIndex;
              const isLast = i === steps.length - 1;
              const Icon = step.icon;
              return (
                <li key={step.key} className="relative flex gap-3">
                  {!isLast && (
                    <span
                      aria-hidden
                      className={`absolute left-[15px] top-8 h-[calc(100%-8px)] w-[2px] ${
                        isDone && !isCurrent ? "bg-primary/70" : "bg-border"
                      }`}
                    />
                  )}
                  <div
                    className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                      isDone
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground"
                    } ${isCurrent ? "ring-4 ring-primary/20" : ""}`}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className={`text-[13px] font-semibold ${isDone ? "text-foreground" : "text-muted-foreground"}`}>
                      {step.label}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {isCurrent ? "In progress · " : ""}
                      {step.hint}
                    </div>
                    {isDone && step.at && (
                      <div className="mt-0.5 text-[11px] font-medium text-foreground/70">
                        {formatDateTime(step.at)}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
            {cancelled && (
              <li className="relative flex gap-3">
                <div className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-destructive bg-destructive text-destructive-foreground">
                  <XCircle className="h-4 w-4" strokeWidth={2.2} />
                </div>
                <div className="pt-1">
                  <div className="text-[13px] font-semibold text-destructive">{m.label}</div>
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {formatDateTime(order.date_modified) ?? "This order was closed without delivery."}
                  </div>
                </div>
              </li>
            )}
          </ol>
        </div>

        {/* Items */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Items ({items.length})
          </div>
          <ul className="divide-y divide-border">
            {items.map((li, i) => {
              const lineTotal = Number(li.total ?? 0);
              return (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
                    {li.image?.src ? (
                      <img src={li.image.src} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] font-medium">{li.name}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {li.sku ? `SKU · ${li.sku} · ` : ""}Qty · {li.quantity ?? 1}
                    </p>
                    {li.meta_data && li.meta_data.length > 0 && (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/80">
                        {li.meta_data
                          .filter((md) => md.display_key && md.display_value)
                          .map((md) => `${md.display_key}: ${md.display_value}`)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-[12.5px] font-semibold tabular-nums">
                    {formatBDT(lineTotal)}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Totals */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Payment summary
          </div>
          <dl className="space-y-1.5 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-medium tabular-nums">{formatBDT(itemsSubtotal)}</dd>
            </div>
            {discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="font-medium tabular-nums text-emerald-700">− {formatBDT(discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                Delivery Charge{shippingMethod ? ` · ${shippingMethod}` : ""}
              </dt>
              <dd className="font-medium tabular-nums">{formatBDT(shippingTotal)}</dd>
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-border pt-2">
              <dt className="text-[13px] font-semibold">Total</dt>
              <dd className="font-display text-[18px] font-bold text-primary tabular-nums">
                {formatBDT(total)}
              </dd>
            </div>
          </dl>
          {order.payment_method_title && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5" />
              {order.payment_method_title}
            </p>
          )}
        </div>

        {/* Delivery address */}
        {addressLines.length > 0 && (
          <div className="rounded-2xl border border-border bg-card shadow-sm p-4">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> Delivery address
            </div>
            {addressLines.map((line, i) => (
              <p key={i} className={i === 0 ? "text-[13px] font-medium" : "mt-0.5 text-[12.5px] text-muted-foreground"}>
                {line}
              </p>
            ))}
            {order.billing?.phone && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <Phone className="h-3 w-3" /> {order.billing.phone}
              </p>
            )}
          </div>
        )}

        {/* Customer note */}
        {order.customer_note && (
          <div className="rounded-2xl border border-border bg-card shadow-sm p-4">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <StickyNote className="h-3.5 w-3.5" /> Order note
            </div>
            <p className="whitespace-pre-wrap text-[12.5px] text-foreground/80">
              {order.customer_note}
            </p>
          </div>
        )}
      </div>

      <div
        className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Total
          </span>
          <span className="font-display text-[20px] font-bold text-primary tabular-nums">
            {formatBDT(total)}
          </span>
        </div>
      </div>
    </div>
  );
}
