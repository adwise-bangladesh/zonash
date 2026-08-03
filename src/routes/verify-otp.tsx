import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { MessageSquareLock, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
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
      {
        name: "description",
        content: "Enter the 4-digit code we texted you to confirm your Zonash order.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Verify your number — Zonash" },
      {
        property: "og:description",
        content: "Enter the 4-digit code we texted you to confirm your Zonash order.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerifyOtpPage,
  errorComponent: ({ reset }) => (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <CheckoutHeader title="Verify your number" />
      <main className="mx-auto w-full max-w-[480px] flex-1 px-3 pt-6">
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
            <TriangleAlert className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="text-[14px] font-semibold">Verification unavailable</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Please try again — your order is still reserved.
          </p>
          <button
            onClick={reset}
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-[13px] font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
          </button>
        </div>
      </main>
    </div>
  ),
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
  const inFlight = useRef(false);

  /** Only trust a well-formed BD mobile from the URL before rendering it. */
  const prettyPhone = useMemo(() => {
    const p = (phone ?? "").replace(/\D/g, "");
    return /^01[3-9]\d{8}$/.test(p) ? `+880 ${p.slice(1, 5)} ${p.slice(5)}` : "your number";
  }, [phone]);

  useEffect(() => {
    hiddenRef.current?.focus();
  }, []);

  // WebOTP autofill (Chrome Android)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("OTPCredential" in window) || !navigator.credentials?.get) return;
    let alive = true;
    const ac = new AbortController();
    (
      navigator.credentials as unknown as {
        get: (o: unknown) => Promise<{ code?: string } | null>;
      }
    )
      .get({ otp: { transport: ["sms"] }, signal: ac.signal })
      .then((cred) => {
        if (alive && cred?.code) setCode(cred.code.replace(/\D/g, "").slice(0, CODE_LEN));
      })
      .catch(() => {});
    return () => {
      alive = false;
      ac.abort();
    };
  }, []);

  const ticking = cooldown > 0;
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [ticking]);

  const submit = useCallback(
    async (full: string) => {
      if (full.length !== CODE_LEN || inFlight.current) return;
      inFlight.current = true;
      setSubmitting(true);
      setError(null);
      try {
        const res = await verifyFn({ data: { order_id: order, code: full } });
        if (!res.ok) {
          setError(res.error);
          setCode("");
          hiddenRef.current?.focus();
          setSubmitting(false);
          inFlight.current = false;
          return;
        }
        // Persist the customer session. The phone comes from the server (the row
        // the OTP was issued for) and only falls back to the URL param — a
        // missing/edited `phone` search param used to silently skip login.
        const verifiedPhone =
          res.phone && /^01[3-9]\d{8}$/.test(res.phone)
            ? res.phone
            : phone && /^01[3-9]\d{8}$/.test(phone)
              ? phone
              : null;
        if (verifiedPhone) setPhone(verifiedPhone);

        navigate({
          to: "/order-status",
          search: { order, number: number ?? String(order) } as never,
        });
      } catch {
        setError("Verification failed. Please try again.");
        setSubmitting(false);
        inFlight.current = false;
      }
    },
    [order, number, phone, verifyFn, setPhone, navigate],
  );

  useEffect(() => {
    if (code.length === CODE_LEN) void submit(code);
  }, [code, submit]);

  const onResend = useCallback(async () => {
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
  }, [cooldown, resending, order, resendFn]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <CheckoutHeader title="Verify your number" />

      <main className="mx-auto w-full max-w-[400px] flex-1 px-4 pb-10 pt-1">
        <AuthHero icon={MessageSquareLock} title="Enter code" subtitle={`Sent to ${prettyPhone}`} />

        <section className="mt-5">
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
            ) : null}
          </div>

          <button
            type="button"
            onClick={onResend}
            disabled={cooldown > 0 || resending}
            className="mx-auto mt-2 flex min-h-11 w-fit items-center justify-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-primary disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${resending ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? "Sending…" : "Resend code"}
          </button>
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
