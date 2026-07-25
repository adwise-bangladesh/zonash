import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { MessageSquareLock, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { verifyOrderOtp, resendOrderOtp } from "@/lib/otp.functions";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { AuthHero, OtpBoxes } from "@/components/checkout/AuthUi";
import { SupportFooter, buildSupportMessage } from "@/components/checkout/SupportFooter";


import { useCustomerSession } from "@/lib/customer-session";

const searchSchema = z.object({
  order: z.coerce.number().int().positive(),
  number: z.coerce.string().optional(),
  phone: z.coerce.string().optional(),
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
  const { setPhone } = useCustomerSession();


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
      // Persist customer session (phone) for future visits — cookie + localStorage.
      const verifiedPhone = phone && /^01[3-9]\d{8}$/.test(phone) ? phone : null;
      if (verifiedPhone) setPhone(verifiedPhone);

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
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <CheckoutHeader title="Verify your number" />

      <main className="mx-auto w-full max-w-[480px] flex-1 px-3 pb-10 pt-3">
        <AuthHero
          icon={MessageSquareLock}
          title="Enter verification code"
          subtitle={`We texted a ${CODE_LEN}-digit code to ${phone ?? "your number"}.`}
          step={2}
        />

        {/* Code card */}
        <section className="mt-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <OtpBoxes
            inputRef={hiddenRef}
            code={code}
            busy={submitting}
            error={!!error}
            length={CODE_LEN}
            onChange={(v) => {
              setCode(v);
              if (error) setError(null);
            }}
          />

          <div className="mt-3 min-h-[18px] text-center text-[12px]">
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
            type="button"
            onClick={onResend}
            disabled={cooldown > 0 || resending}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-secondary text-[13px] font-semibold text-secondary-foreground transition-transform active:scale-[0.99] disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${resending ? "animate-spin" : ""}`} aria-hidden="true" />
            {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? "Sending…" : "Resend code"}
          </button>

          <div className="mt-3 flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
            <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Your order stays reserved while you verify. Never share this code with anyone.
            </p>
          </div>
        </section>


        <div className="mt-6 pb-[env(safe-area-inset-bottom)]">
          <SupportFooter
            label="Didn't get the code?"
            waMessage={buildSupportMessage({
              page: "Verify OTP",
              orderNumber: number ?? order,
              phone,
              extra: "The code hasn't arrived yet.",
            })}
          />
        </div>
      </main>
    </div>
  );
}

