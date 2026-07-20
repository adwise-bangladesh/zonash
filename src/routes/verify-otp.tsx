import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { MessageSquareLock, Loader2, RefreshCw, PhoneCall } from "lucide-react";
import { verifyOrderOtp, resendOrderOtp } from "@/lib/otp.functions";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";

const searchSchema = z.object({
  order: z.coerce.number().int().positive(),
  number: z.string().optional(),
  phone: z.string().optional(),
});

export const Route = createFileRoute("/verify-otp")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Verify your number — Zonash" },
      { name: "description", content: "Enter the 4-digit code we texted you to confirm your Zonash order." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifyOtpPage,
});

const CODE_LEN = 4;

function VerifyOtpPage() {
  const navigate = useNavigate();
  const { order, number, phone } = Route.useSearch();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);
  const [resending, setResending] = useState(false);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const verifyFn = useServerFn(verifyOrderOtp);
  const resendFn = useServerFn(resendOrderOtp);

  const digits = useMemo(() => {
    const arr = code.split("");
    while (arr.length < CODE_LEN) arr.push("");
    return arr.slice(0, CODE_LEN);
  }, [code]);

  // Focus hidden input on mount + on tap anywhere on the boxes.
  useEffect(() => {
    hiddenRef.current?.focus();
  }, []);

  // WebOTP API — Chrome Android auto-reads SMS with `@domain #code` footer.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      OTPCredential?: unknown;
      AbortController: typeof AbortController;
    };
    if (!("OTPCredential" in window)) return;
    const ac = new w.AbortController();
    (navigator.credentials as unknown as {
      get: (o: unknown) => Promise<{ code?: string } | null>;
    })
      .get({ otp: { transport: ["sms"] }, signal: ac.signal })
      .then((cred) => {
        if (cred?.code) {
          const clean = cred.code.replace(/\D/g, "").slice(0, CODE_LEN);
          setCode(clean);
        }
      })
      .catch(() => {
        /* user dismissed or unsupported */
      });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const submit = async (full: string) => {
    if (full.length !== CODE_LEN) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await verifyFn({ data: { order_id: order, code: full } });
      if (!res.ok) {
        setError(res.error);
        setCode("");
        hiddenRef.current?.focus();
        setSubmitting(false);
        return;
      }
      if (res.decision === "confirmed") {
        navigate({
          to: "/order-callback-choice",
          search: { order, number: number ?? String(order) } as never,
        });
      } else {
        navigate({
          to: "/order-review",
          search: {
            order,
            reason: res.reason ?? "",
            duplicates: JSON.stringify(res.duplicates ?? []),
          } as never,
        });
      }
    } catch (e) {
      console.error(e);
      setError("Verification failed. Please try again.");
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (code.length === CODE_LEN && !submitting) void submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const onResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      const res = await resendFn({ data: { order_id: order } });
      if (res.ok) {
        toast.success("New code sent");
        setCode("");
        setError(null);
        setCooldown(60);
        hiddenRef.current?.focus();
      } else {
        toast.error(res.error || "Could not resend");
      }
    } catch {
      toast.error("Could not resend. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const focusHidden = () => hiddenRef.current?.focus();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-background via-muted/40 to-background">
      <CheckoutHeader title="Verify your number" />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8 pt-6">
        {/* Hero card */}
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-background/90 p-6 shadow-[0_20px_60px_-30px_rgba(58,2,3,0.35)] backdrop-blur">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-primary/5 blur-2xl"
          />

          <div className="relative mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/30">
            <MessageSquareLock className="h-8 w-8" strokeWidth={1.8} />
          </div>

          <div className="relative text-center">
            <h1 className="text-xl font-bold tracking-tight">Enter verification code</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              We texted a {CODE_LEN}-digit code to
              <br />
              <span className="font-semibold text-foreground">{phone ?? "your number"}</span>
            </p>

            {/* Code boxes */}
            <div className="relative mt-7">
              <input
                ref={hiddenRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                enterKeyHint="done"
                maxLength={CODE_LEN}
                value={code}
                onChange={(e) => {
                  const clean = e.target.value.replace(/\D/g, "").slice(0, CODE_LEN);
                  setCode(clean);
                  if (error) setError(null);
                }}
                disabled={submitting}
                aria-label="One-time verification code"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <div
                className="flex justify-center gap-2.5"
                onClick={focusHidden}
              >
                {digits.map((d, i) => {
                  const active = code.length === i;
                  const filled = !!d;
                  return (
                    <div
                      key={i}
                      className={[
                        "grid h-14 w-12 place-items-center rounded-xl border-2 bg-background text-2xl font-bold tabular-nums transition-all sm:h-16 sm:w-14",
                        error
                          ? "border-destructive/70 text-destructive"
                          : filled
                            ? "border-primary text-foreground shadow-sm shadow-primary/20"
                            : active
                              ? "border-primary/60"
                              : "border-border",
                      ].join(" ")}
                    >
                      {d || (active && !submitting ? (
                        <span className="h-6 w-[2px] animate-pulse rounded-full bg-primary" />
                      ) : null)}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 min-h-[18px] text-xs">
              {error ? (
                <span className="font-medium text-destructive">{error}</span>
              ) : submitting ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Verifying your code…
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Auto-detects when your SMS arrives
                </span>
              )}
            </div>

            <button
              onClick={onResend}
              disabled={cooldown > 0 || resending}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 disabled:text-muted-foreground disabled:hover:bg-transparent"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${resending ? "animate-spin" : ""}`} />
              {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? "Sending…" : "Resend code"}
            </button>
          </div>
        </div>

        {/* Helper card */}
        <a
          href="tel:+8809647111000"
          className="mt-4 flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-left transition-colors hover:bg-muted/50"
        >
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
            <PhoneCall className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-semibold">Didn't get the code?</p>
            <p className="text-[11px] text-muted-foreground">Call support to confirm your order manually</p>
          </div>
        </a>

        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          Order #{number ?? order} · Do not share this code with anyone
        </p>
      </div>
    </div>
  );
}
