import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { PhoneCall, Clock } from "lucide-react";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { SupportFooter } from "@/components/checkout/SupportFooter";

const searchSchema = z.object({
  order: z.coerce.number().int().positive(),
  number: z.string().optional(),
});

export const Route = createFileRoute("/order-pending")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Order pending call verification — Zonash" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderPendingPage,
});

function OrderPendingPage() {
  const { order, number } = Route.useSearch();
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-gradient-to-b from-background via-muted/40 to-background">
      <CheckoutHeader title="Order pending" />

      <main className="relative flex flex-1 flex-col px-5 pb-4 pt-2">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-8 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          {/* Animated call illustration */}
          <div className="relative mx-auto mb-6 h-28 w-28">
            <svg viewBox="0 0 112 112" className="h-28 w-28">
              <defs>
                <linearGradient id="pendGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
                </linearGradient>
              </defs>
              <circle cx="56" cy="56" r="52" fill="url(#pendGrad)">
                <animate attributeName="r" values="46;54;46" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle cx="56" cy="56" r="40" fill="hsl(var(--primary) / 0.18)">
                <animate attributeName="r" values="36;42;36" dur="2.4s" repeatCount="indefinite" begin="0.4s" />
              </circle>
              <circle cx="56" cy="56" r="30" fill="hsl(var(--primary) / 0.25)" />
            </svg>
            <span className="absolute inset-0 grid place-items-center">
              <PhoneCall className="h-10 w-10 text-primary animate-[wiggle_1.2s_ease-in-out_infinite]" />
            </span>
          </div>

          <h1 className="text-center text-2xl font-bold tracking-tight">Call verification required</h1>
          <p className="mt-2 text-center text-[13px] leading-relaxed text-muted-foreground">
            Order <span className="font-semibold text-foreground">#{number ?? order}</span> is saved as pending.
            <br />
            Our team will call you shortly to confirm.
          </p>

          <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-3.5 text-left">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> What happens next
            </div>
            <ol className="mt-2 space-y-1.5 text-[12.5px] text-foreground/90">
              <li>1. We call the number you provided.</li>
              <li>2. Confirm items, address & delivery time.</li>
              <li>3. Parcel is dispatched — pay on arrival.</li>
            </ol>
          </div>

          <Link
            to="/"
            className="mt-5 flex h-11 items-center justify-center rounded-2xl border border-border text-sm font-semibold"
          >
            Continue shopping
          </Link>
        </div>

        <div className="relative mx-auto w-full max-w-md pb-[env(safe-area-inset-bottom)]">
          <SupportFooter label="Need to speak to us now?" />
        </div>
      </main>

      <style>{`
        @keyframes wiggle {
          0%,100% { transform: rotate(-8deg); }
          50% { transform: rotate(8deg); }
        }
      `}</style>
    </div>
  );
}
