import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LogOut,
  Phone,
  ShieldCheck,
  RefreshCw,
  Loader2,
  Package,
  ArrowRight,
  Receipt,
  Inbox,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useCustomerSession } from "@/lib/customer-session";
import {
  requestCustomerLoginOtp,
  verifyCustomerLoginOtp,
  listOrdersByPhone,
} from "@/lib/customer-auth.functions";
import { formatBDT } from "@/lib/format";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "My orders — Zonash" },
      { name: "description", content: "Sign in with your mobile number to view your Zonash orders." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const { phone, ready, setPhone, logout } = useCustomerSession();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/20">
      <AppHeader />
      <main className="flex-1">
        {!ready ? (
          <div className="grid min-h-[60vh] place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : phone ? (
          <SignedInOrders phone={phone} onLogout={logout} />
        ) : (
          <PhoneLoginGate onSignedIn={setPhone} />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

// -------------------- Login (phone + OTP) --------------------

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
        setBusy(false);
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

  const verify = async (full: string) => {
    if (full.length !== 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await verifyFn({ data: { phone, code: full } });
      if (!res.ok) {
        setError(res.error);
        setCode("");
        setBusy(false);
        codeRef.current?.focus();
        return;
      }
      onSignedIn(res.phone);
      toast.success("Signed in");
    } catch {
      setError("Verification failed. Please try again.");
      setBusy(false);
    }
  };

  useEffect(() => {
    if (step === "otp" && code.length === 4 && !busy) void verify(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step]);

  const boxes = useMemo(() => {
    const arr = code.split("");
    while (arr.length < 4) arr.push("");
    return arr.slice(0, 4);
  }, [code]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-5 pb-16 pt-8 md:pt-14">
      <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-xl shadow-primary/25">
        <Receipt className="h-7 w-7" strokeWidth={1.8} />
      </div>
      <h1 className="text-center font-display text-2xl font-semibold tracking-tight">
        Track your orders
      </h1>
      <p className="mt-1.5 text-center text-[13px] text-muted-foreground">
        {step === "phone"
          ? "Sign in with your mobile number to see your Zonash orders."
          : `We sent a 4-digit code to ${phone}.`}
      </p>

      <div className="mt-7 rounded-2xl border border-border bg-background p-4 shadow-sm">
        {step === "phone" ? (
          <>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Mobile number
            </label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => {
                  setPhoneInput(e.target.value.replace(/\D/g, "").slice(0, 11));
                  if (error) setError(null);
                }}
                placeholder="01XXXXXXXXX"
                autoComplete="tel-national"
                className="h-12 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-base outline-none transition-colors focus:border-primary"
              />
            </div>
            {error && (
              <p className="mt-2 text-[12px] font-medium text-destructive">{error}</p>
            )}
            <button
              onClick={() => sendCode(false)}
              disabled={busy || !/^01[3-9]\d{8}$/.test(phone)}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground shadow-[var(--shadow-glow)] transition-all disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Send login code
              <ArrowRight className="h-4 w-4" />
            </button>
            <p className="mt-2.5 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3" /> One-tap sign-in · No password needed
            </p>
          </>
        ) : (
          <>
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
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <div className="flex justify-center gap-3" onClick={() => codeRef.current?.focus()}>
                {boxes.map((d, i) => {
                  const active = code.length === i;
                  const filled = !!d;
                  return (
                    <div
                      key={i}
                      className={[
                        "grid h-14 w-12 place-items-center rounded-xl border-2 bg-background text-2xl font-bold tabular-nums transition-all",
                        error
                          ? "border-destructive/70 text-destructive"
                          : filled
                            ? "border-primary text-foreground shadow-sm shadow-primary/20"
                            : active
                              ? "border-primary/60"
                              : "border-border",
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
            <div className="mt-3 min-h-[18px] text-center text-xs">
              {error ? (
                <span className="font-medium text-destructive">{error}</span>
              ) : busy ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying…
                </span>
              ) : (
                <span className="text-muted-foreground">Auto-detects when your SMS arrives</span>
              )}
            </div>
            <div className="mt-1 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setCode("");
                  setError(null);
                }}
                className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
              >
                Change number
              </button>
              <button
                type="button"
                onClick={() => sendCode(true)}
                disabled={cooldown > 0 || busy}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary disabled:text-muted-foreground"
              >
                <RefreshCw className="h-3 w-3" />
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// -------------------- Signed-in orders list --------------------

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-500/12 text-amber-700" },
  "on-hold": { label: "On hold", className: "bg-amber-500/12 text-amber-700" },
  processing: { label: "Processing", className: "bg-sky-500/12 text-sky-700" },
  confirmed: { label: "Confirmed", className: "bg-sky-500/12 text-sky-700" },
  completed: { label: "Delivered", className: "bg-emerald-500/12 text-emerald-700" },
  cancelled: { label: "Cancelled", className: "bg-rose-500/10 text-rose-700" },
  refunded: { label: "Refunded", className: "bg-rose-500/10 text-rose-700" },
  failed: { label: "Failed", className: "bg-rose-500/10 text-rose-700" },
};

function statusChip(status: string) {
  const s = STATUS_STYLES[status] ?? { label: status, className: "bg-muted text-foreground/70" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.className}`}>
      {s.label}
    </span>
  );
}

function SignedInOrders({ phone, onLogout }: { phone: string; onLogout: () => void }) {
  const listFn = useServerFn(listOrdersByPhone);
  const q = useQuery({
    queryKey: ["customer-orders", phone],
    queryFn: () => listFn({ data: { phone } }),
    staleTime: 60_000,
  });

  const orders = q.data?.orders ?? [];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">My orders</h1>
          <p className="text-[12.5px] text-muted-foreground">
            Signed in as <span className="font-semibold text-foreground">{phone}</span>
          </p>
        </div>
        <button
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[12px] font-semibold text-foreground/80 transition-colors hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </header>

      {q.isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-muted/40" />
          ))}
        </div>
      ) : q.isError || q.data?.error ? (
        <div className="rounded-2xl border border-dashed border-border bg-background p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {q.data?.error ?? "Could not load your orders."}
          </p>
          <button
            onClick={() => q.refetch()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-background p-10 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-muted">
            <Inbox className="h-6 w-6 text-muted-foreground" />
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
        <ul className="space-y-2.5">
          {orders.map((o) => {
            const first = o.line_items?.[0];
            const image = first?.image?.src;
            const rest = Math.max(0, (o.line_items?.length ?? 0) - 1);
            return (
              <li
                key={o.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3 transition-shadow hover:shadow-sm"
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
                      #{o.number}
                    </span>
                    {statusChip(o.status)}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[13px] font-medium">
                    {first?.name ?? "Order"}
                    {rest > 0 && (
                      <span className="text-muted-foreground"> + {rest} more</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {new Date(o.date_created).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[15px] font-bold text-primary">
                    {formatBDT(Number(o.total))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
