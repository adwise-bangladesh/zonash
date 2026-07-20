import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";
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

function VerifyOtpPage() {
  const navigate = useNavigate();
  const { order, number, phone } = Route.useSearch();
  const [code, setCode] = useState<string[]>(["", "", "", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];
  const verifyFn = useServerFn(verifyOrderOtp);
  const resendFn = useServerFn(resendOrderOtp);

  useEffect(() => {
    refs[0].current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, "").slice(-1);
    setCode((prev) => {
      const next = [...prev];
      next[i] = d;
      return next;
    });
    if (d && i < 3) refs[i + 1].current?.focus();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (digits.length === 0) return;
    e.preventDefault();
    const next = ["", "", "", ""];
    for (let i = 0; i < digits.length; i++) next[i] = digits[i];
    setCode(next);
    refs[Math.min(digits.length, 3)].current?.focus();
  };

  const submit = async (full: string) => {
    if (full.length !== 4) {
      toast.error("Enter the 4-digit code");
      return;
    }
    setSubmitting(true);
    try {
      const res = await verifyFn({ data: { order_id: order, code: full } });
      if (!res.ok) {
        toast.error(res.error);
        setSubmitting(false);
        return;
      }
      if (res.decision === "confirmed") {
        toast.success("Order confirmed");
        navigate({
          to: "/order-confirmed",
          search: { number: number ?? String(order), total: "" } as never,
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
      toast.error("Verification failed. Please try again.");
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const full = code.join("");
    if (full.length === 4 && !submitting) void submit(full);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const onResend = async () => {
    if (cooldown > 0) return;
    try {
      const res = await resendFn({ data: { order_id: order } });
      if (res.ok) {
        toast.success("New code sent");
        setCode(["", "", "", ""]);
        setCooldown(60);
        refs[0].current?.focus();
      } else {
        toast.error(res.error || "Could not resend");
      }
    } catch {
      toast.error("Could not resend. Please try again.");
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/30">
      <CheckoutHeader title="Verify your number" />
      <div className="mx-auto w-full max-w-md flex-1 px-3 pt-8">
        <div className="rounded-[4px] border border-border bg-background p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-primary/10">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-lg font-bold">Enter your verification code</h1>
          <p className="mt-1.5 text-xs text-muted-foreground">
            We sent a 4-digit code to <span className="font-semibold">{phone ?? "your number"}</span>.
          </p>

          <div className="mt-6 flex justify-center gap-2.5">
            {code.map((d, i) => (
              <input
                key={i}
                ref={refs[i]}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onPaste={onPaste}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !d && i > 0) refs[i - 1].current?.focus();
                }}
                className="h-14 w-12 rounded-[4px] border-2 border-border bg-background text-center text-2xl font-bold outline-none transition-colors focus:border-primary"
                disabled={submitting}
              />
            ))}
          </div>

          <button
            onClick={() => submit(code.join(""))}
            disabled={submitting || code.join("").length !== 4}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[4px] bg-primary text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying…
              </>
            ) : (
              "Verify & Confirm"
            )}
          </button>

          <button
            onClick={onResend}
            disabled={cooldown > 0}
            className="mt-3 text-xs font-semibold text-primary underline-offset-2 hover:underline disabled:text-muted-foreground disabled:no-underline"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Didn't get it? Resend code"}
          </button>

          <p className="mt-5 text-[11px] text-muted-foreground">Order #{number ?? order}</p>
        </div>
      </div>
    </div>
  );
}
