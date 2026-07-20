import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Inbox,
  Loader2,
  LogOut,
  Package,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { TopAnnouncementBar } from "@/components/layout/TopAnnouncementBar";
import { useCustomerSession } from "@/lib/customer-session";
import {
  listOrdersByPhone,
  requestCustomerLoginOtp,
  verifyCustomerLoginOtp,
} from "@/lib/customer-auth.functions";
import { formatBDT } from "@/lib/format";

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
// Login gate — full-screen, app-style, no header/footer
// ============================================================

function PhoneLoginGate({ onSignedIn }: { onSignedIn: (p: string) => void }) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhoneInput] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const requestFn = useServerFn(requestCustomerLoginOtp);
  const verifyFn = useServerFn(verifyCustomerLoginOtp);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const sendCode = async (resend = false) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await requestFn({ data: { phone } });
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
        const res = await verifyFn({ data: { phone, code: full } });
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
    [busy, phone, verifyFn, onSignedIn],
  );

  useEffect(() => {
    if (step === "otp" && code.length === 4 && !busy) void verify(code);
  }, [code, step, busy, verify]);

  const boxes = useMemo(() => {
    const arr = code.split("");
    while (arr.length < 4) arr.push("");
    return arr.slice(0, 4);
  }, [code]);

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-gradient-to-b from-primary/8 via-background to-background">
      {/* Ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 right-0 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
      />

      {/* Top bar */}
      <div
        className="relative z-10 flex items-center justify-between px-4 pb-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)" }}
      >
        <Link
          to="/"
          aria-label="Back to home"
          className="grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-background/70 text-foreground backdrop-blur transition-colors hover:bg-background"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="font-display text-[15px] font-semibold tracking-tight">Zonash</span>
        <span className="h-9 w-9" aria-hidden />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-10">
        <div className="mx-auto flex w-full max-w-sm flex-col items-center">
          <div className="relative mb-6">
            <div
              aria-hidden
              className="absolute inset-0 -m-3 animate-pulse rounded-3xl bg-primary/20 blur-xl"
            />
            <div className="relative grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-xl shadow-primary/30">
              <Package className="h-9 w-9" strokeWidth={1.6} />
            </div>
          </div>

          <h1 className="text-center font-display text-[26px] font-semibold leading-tight tracking-tight">
            {step === "phone" ? "Your orders, one tap away" : "Enter verification code"}
          </h1>
          <p className="mt-2 max-w-[280px] text-center text-[13.5px] leading-relaxed text-muted-foreground">
            {step === "phone"
              ? "Sign in with your mobile number to view every order you've placed with Zonash."
              : `We sent a 4-digit code to ${phone}. It auto-fills when your SMS arrives.`}
          </p>

          <div className="mt-8 w-full">
            {step === "phone" ? (
              <div className="space-y-3">
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 select-none text-[15px] font-semibold text-muted-foreground">
                    +880
                  </span>
                  <Phone
                    className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => {
                      setPhoneInput(e.target.value.replace(/\D/g, "").slice(0, 11));
                      if (error) setError(null);
                    }}
                    placeholder="1XXXXXXXXX"
                    autoComplete="tel-national"
                    aria-label="Mobile number"
                    className="h-14 w-full rounded-2xl border border-border/70 bg-background/80 pl-16 pr-11 text-[16px] font-medium tracking-wide backdrop-blur outline-none transition-all focus:border-primary focus:bg-background focus:shadow-[0_0_0_4px] focus:shadow-primary/15"
                  />
                </div>
                {error && (
                  <p className="text-center text-[12.5px] font-medium text-destructive">{error}</p>
                )}
                <button
                  onClick={() => sendCode(false)}
                  disabled={busy || !/^01[3-9]\d{8}$/.test(phone)}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primary/85 text-[14px] font-bold uppercase tracking-[0.1em] text-primary-foreground shadow-lg shadow-primary/25 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Send code <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
                <div className="mt-2 flex items-center justify-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Secure sign-in · No password
                </div>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <input
                    ref={codeRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 4));
                      if (error) setError(null);
                    }}
                    aria-label="One-time verification code"
                    className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                  />
                  <div
                    className="flex justify-center gap-3"
                    onClick={() => codeRef.current?.focus()}
                  >
                    {boxes.map((d, i) => {
                      const active = code.length === i;
                      const filled = !!d;
                      return (
                        <div
                          key={i}
                          className={[
                            "grid h-16 w-14 place-items-center rounded-2xl border-2 bg-background/70 text-2xl font-bold tabular-nums backdrop-blur transition-all",
                            error
                              ? "border-destructive/70 text-destructive"
                              : filled
                                ? "border-primary text-foreground shadow-md shadow-primary/20"
                                : active
                                  ? "border-primary/60"
                                  : "border-border/70",
                          ].join(" ")}
                        >
                          {d ||
                            (active && !busy ? (
                              <span className="h-6 w-[2px] animate-pulse rounded-full bg-primary" />
                            ) : null)}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-4 min-h-[20px] text-center text-[12.5px]">
                  {error ? (
                    <span className="font-medium text-destructive">{error}</span>
                  ) : busy ? (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying…
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Sparkles className="h-3 w-3 text-primary" />
                      Auto-detects when SMS arrives
                    </span>
                  )}
                </div>
                <div className="mt-6 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("phone");
                      setCode("");
                      setError(null);
                    }}
                    className="text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    ← Change number
                  </button>
                  <button
                    type="button"
                    onClick={() => sendCode(true)}
                    disabled={cooldown > 0 || busy}
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary disabled:text-muted-foreground"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Orders list — app-style with infinite scroll + detail sheet
// ============================================================

type OrderRow = Awaited<ReturnType<typeof listOrdersByPhone>>["orders"][number];

const STATUS_STYLES: Record<
  string,
  { label: string; chip: string; dot: string }
> = {
  pending: {
    label: "Pending",
    chip: "bg-amber-500/12 text-amber-700 border-amber-500/25",
    dot: "bg-amber-500",
  },
  "on-hold": {
    label: "On hold",
    chip: "bg-amber-500/12 text-amber-700 border-amber-500/25",
    dot: "bg-amber-500",
  },
  processing: {
    label: "Processing",
    chip: "bg-sky-500/12 text-sky-700 border-sky-500/25",
    dot: "bg-sky-500",
  },
  confirmed: {
    label: "Confirmed",
    chip: "bg-sky-500/12 text-sky-700 border-sky-500/25",
    dot: "bg-sky-500",
  },
  completed: {
    label: "Delivered",
    chip: "bg-emerald-500/12 text-emerald-700 border-emerald-500/25",
    dot: "bg-emerald-500",
  },
  cancelled: {
    label: "Cancelled",
    chip: "bg-rose-500/10 text-rose-700 border-rose-500/20",
    dot: "bg-rose-500",
  },
  refunded: {
    label: "Refunded",
    chip: "bg-rose-500/10 text-rose-700 border-rose-500/20",
    dot: "bg-rose-500",
  },
  failed: {
    label: "Failed",
    chip: "bg-rose-500/10 text-rose-700 border-rose-500/20",
    dot: "bg-rose-500",
  },
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

  // Infinite-scroll observer
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          query.hasNextPage &&
          !query.isFetchingNextPage
        ) {
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
    <div className="flex min-h-[100dvh] flex-col bg-muted/25">
      <TopAnnouncementBar />
      <SiteHeader />

      {/* App-style compact page header */}
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur-lg">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="font-display text-[18px] font-semibold leading-tight tracking-tight">
              My orders
            </h1>
            <p className="text-[11.5px] text-muted-foreground">
              +880 <span className="font-semibold text-foreground/85">{phone}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              aria-label="Refresh"
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background text-foreground/70 transition-colors hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
              />
            </button>
            <button
              onClick={onLogout}
              aria-label="Sign out"
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background text-foreground/70 transition-colors hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-4">
        {query.isLoading ? (
          <ul className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <li
                key={i}
                className="h-[92px] animate-pulse rounded-2xl border border-border bg-background"
              />
            ))}
          </ul>
        ) : firstError || query.isError ? (
          <div className="rounded-2xl border border-dashed border-border bg-background p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {firstError ?? "Could not load your orders."}
            </p>
            <button
              onClick={() => query.refetch()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background p-12 text-center">
            <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-muted">
              <Inbox className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="font-semibold">No orders yet</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              When you place an order, it will appear here.
            </p>
            <Link
              to="/products"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-foreground"
            >
              Start shopping <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <>
            <ul className="space-y-2.5">
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
      </main>

      <OrderDetailSheet
        order={openOrder}
        onClose={() => setOpenOrder(null)}
      />
    </div>
  );
}

function OrderCard({ order, onOpen }: { order: OrderRow; onOpen: () => void }) {
  const first = order.line_items?.[0];
  const image = first?.image?.src;
  const rest = Math.max(0, (order.line_items?.length ?? 0) - 1);
  const itemCount = (order.line_items ?? []).reduce(
    (n, li) => n + (li.quantity ?? 1),
    0,
  );
  return (
    <li>
      <button
        onClick={onOpen}
        className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left transition-all hover:border-primary/40 hover:shadow-sm active:scale-[0.997]"
      >
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
          {image ? (
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <Package className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-muted-foreground">
              #{order.number}
            </span>
            <StatusChip status={order.status} />
          </div>
          <p className="mt-0.5 line-clamp-1 text-[13px] font-medium">
            {first?.name ?? "Order"}
            {rest > 0 && (
              <span className="text-muted-foreground"> + {rest} more</span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {new Date(order.date_created).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}{" "}
            · {itemCount} item{itemCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="text-[15px] font-bold text-primary">
            {formatBDT(Number(order.total))}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
      </button>
    </li>
  );
}

// ============================================================
// Order detail sheet with status timeline
// ============================================================

const TIMELINE: {
  key: string;
  label: string;
  hint: string;
  icon: typeof Clock;
}[] = [
  { key: "placed", label: "Order placed", hint: "We received your order", icon: CheckCircle2 },
  { key: "confirmed", label: "Confirmed", hint: "Payment method confirmed", icon: ShieldCheck },
  { key: "processing", label: "Processing", hint: "Packing your items", icon: Package },
  { key: "shipped", label: "Shipped", hint: "Handed to courier", icon: Truck },
  { key: "completed", label: "Delivered", hint: "Enjoy your order", icon: Sparkles },
];

function timelineStateFor(status: string): {
  activeIndex: number;
  cancelled: boolean;
} {
  if (["cancelled", "failed", "refunded"].includes(status))
    return { activeIndex: 0, cancelled: true };
  if (status === "pending" || status === "on-hold") return { activeIndex: 0, cancelled: false };
  if (status === "confirmed") return { activeIndex: 1, cancelled: false };
  if (status === "processing") return { activeIndex: 2, cancelled: false };
  if (status === "shipped") return { activeIndex: 3, cancelled: false };
  if (status === "completed") return { activeIndex: 4, cancelled: false };
  return { activeIndex: 0, cancelled: false };
}

function OrderDetailSheet({
  order,
  onClose,
}: {
  order: OrderRow | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!order} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto p-0 sm:max-w-md"
      >
        {order && <OrderDetailBody order={order} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function OrderDetailBody({
  order,
  onClose,
}: {
  order: OrderRow;
  onClose: () => void;
}) {
  const m = statusMeta(order.status);
  const { activeIndex, cancelled } = timelineStateFor(order.status);
  const items = order.line_items ?? [];
  const itemsTotal = items.reduce(
    (n, li) => n + (li.quantity ?? 1) * 0, // unused; woo returns total already
    0,
  );
  void itemsTotal;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/20">
      {/* Header */}
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

      <div className="flex-1 space-y-4 px-4 py-4">
        {/* Hero status */}
        <div className="rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <StatusChip status={order.status} />
            <span className="text-[11.5px] text-muted-foreground">
              {new Date(order.date_created).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          <p className="mt-2 text-[13.5px] font-medium">
            {cancelled
              ? "This order was not completed."
              : order.status === "completed"
                ? "Your order was delivered. Thanks for shopping with Zonash."
                : order.status === "pending" || order.status === "on-hold"
                  ? "We're verifying your order. You'll get an SMS as it progresses."
                  : "Your order is on the way through our fulfillment flow."}
          </p>
        </div>

        {/* Timeline */}
        <div className="rounded-2xl border border-border bg-background p-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Status timeline
          </div>
          <ol className="relative space-y-4">
            {TIMELINE.map((step, i) => {
              const isDone = !cancelled && i <= activeIndex;
              const isCurrent = !cancelled && i === activeIndex;
              const isLast = i === TIMELINE.length - 1;
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
                    <div
                      className={`text-[13px] font-semibold ${
                        isDone ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {step.label}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {isCurrent ? "In progress · " : ""}
                      {step.hint}
                    </div>
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
                  <div className="text-[13px] font-semibold text-destructive">
                    {m.label}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                    This order was closed without delivery.
                  </div>
                </div>
              </li>
            )}
          </ol>
        </div>

        {/* Items */}
        <div className="overflow-hidden rounded-2xl border border-border bg-background">
          <div className="border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Items ({items.length})
          </div>
          <ul className="divide-y divide-border">
            {items.map((li, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                  {li.image?.src ? (
                    <img
                      src={li.image.src}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] font-medium">{li.name}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    Qty · {li.quantity ?? 1}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Delivery */}
        {(order.shipping?.city || order.billing?.address_1) && (
          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Delivery to
            </div>
            <p className="text-[13px] font-medium">
              {[order.billing?.first_name, order.billing?.last_name]
                .filter(Boolean)
                .join(" ") || "—"}
            </p>
            {order.billing?.address_1 && (
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                {order.billing.address_1}
              </p>
            )}
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {order.shipping?.city || order.billing?.city || ""}
            </p>
            {order.billing?.phone && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <Phone className="h-3 w-3" /> {order.billing.phone}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sticky total footer */}
      <div
        className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Total paid
          </span>
          <span className="font-display text-[20px] font-bold text-primary">
            {formatBDT(Number(order.total))}
          </span>
        </div>
      </div>
    </div>
  );
}
