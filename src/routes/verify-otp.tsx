import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { MessageSquareLock, Loader2, RefreshCw } from "lucide-react";
import { verifyOrderOtp, resendOrderOtp } from "@/lib/otp.functions";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { SupportFooter } from "@/components/checkout/SupportFooter";

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

  useEffect(() => {
    hiddenRef.current?.focus();
  }, []);

  // WebOTP autofill (Chrome Android)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("OTPCredential" in window)) return;
    const ac = new AbortController();
    (navigator.credentials as unknown as {
      get: (o: unknown) => Promise<{ code?: string } | null>;
    })
      .get({ otp: { transport: ["sms"] }, signal: ac.signal })
      .then((cred) => {
        if (cred?.code) setCode(cred.code.replace(/\D/g, "").slice(0, CODE_LEN));
      })
      .catch(() => {});
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
        navigate({ to: "/order-callback-choice", search: { order, number: number ?? String(order) } as never });
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

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-gradient-to-b from-background via-muted/40 to-background">
      <CheckoutHeader title="Verify your number" />

      <main className="relative flex flex-1 flex-col px-5 pb-4 pt-2">
        {/* soft ambient glow */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-8 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          {/* Icon */}
          <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-xl shadow-primary/30 animate-in zoom-in-50 duration-500">
            <MessageSquareLock className="h-9 w-9" strokeWidth={1.8} />
          </div>

          <h1 className="text-center text-2xl font-bold tracking-tight">Enter verification code</h1>
          <p className="mt-2 text-center text-[13px] leading-relaxed text-muted-foreground">
            We texted a {CODE_LEN}-digit code to
            <br />
            <span className="font-semibold text-foreground">{phone ?? "your number"}</span>
          </p>

          {/* Code boxes */}
          <div className="relative mt-8">
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
            <div className="flex justify-center gap-3" onClick={() => hiddenRef.current?.focus()}>
              {digits.map((d, i) => {
                const active = code.length === i;
                const filled = !!d;
                return (
                  <div
                    key={i}
                    className={[
                      "grid h-16 w-14 place-items-center rounded-2xl border-2 bg-background text-3xl font-bold tabular-nums transition-all",
                      error
                        ? "border-destructive/70 text-destructive"
                        : filled
                          ? "border-primary text-foreground shadow-md shadow-primary/20"
                          : active
                            ? "border-primary/60"
                            : "border-border",
                    ].join(" ")}
                  >
                    {d ||
                      (active && !submitting ? (
                        <span className="h-7 w-[2px] animate-pulse rounded-full bg-primary" />
                      ) : null)}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 text-center text-xs min-h-[18px]">
            {error ? (
              <span className="font-medium text-destructive">{error}</span>
            ) : submitting ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Verifying…
              </span>
            ) : (
              <span className="text-muted-foreground">Auto-detects when your SMS arrives</span>
            )}
          </div>

          <button
            onClick={onResend}
            disabled={cooldown > 0 || resending}
            className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 disabled:text-muted-foreground disabled:hover:bg-transparent"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${resending ? "animate-spin" : ""}`} />
            {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? "Sending…" : "Resend code"}
          </button>
        </div>

        <div className="relative mx-auto w-full max-w-md pb-[env(safe-area-inset-bottom)]">
          <SupportFooter label="Didn't get the code?" />
        </div>
      </main>
    </div>
  );
}
