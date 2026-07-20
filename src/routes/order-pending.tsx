import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { PhoneCall, Clock } from "lucide-react";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";

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
    <div className="flex min-h-[100dvh] flex-col bg-muted/30">
      <CheckoutHeader title="Order pending" />
      <div className="mx-auto w-full max-w-md flex-1 px-3 pt-8 pb-12">
        <div className="rounded-[6px] border border-border bg-background p-6 text-center shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
          {/* Animated call illustration */}
          <div className="relative mx-auto mb-5 h-24 w-24">
            <svg viewBox="0 0 96 96" className="h-24 w-24">
              <defs>
                <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
                </linearGradient>
              </defs>
              <circle cx="48" cy="48" r="44" fill="url(#ringGrad)">
                <animate attributeName="r" values="40;46;40" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle cx="48" cy="48" r="32" fill="hsl(var(--primary) / 0.15)" />
            </svg>
            <span className="absolute inset-0 grid place-items-center">
              <PhoneCall className="h-9 w-9 text-primary animate-[wiggle_1.2s_ease-in-out_infinite]" />
            </span>
          </div>

          <h1 className="text-lg font-bold tracking-tight">Call verification required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Order <span className="font-semibold text-foreground">#{number ?? order}</span> is
            saved as pending. Our team will call you shortly to confirm delivery details
            before dispatch.
          </p>

          <div className="mt-5 rounded-[4px] border border-dashed border-border bg-muted/30 px-3 py-3 text-left">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> What happens next
            </div>
            <ol className="mt-2 space-y-1.5 text-[12.5px] text-foreground/90">
              <li>1. We call you on the number you provided.</li>
              <li>2. Confirm items, address and delivery time.</li>
              <li>3. Parcel is dispatched — you pay on delivery.</li>
            </ol>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <a
              href="tel:+8801700000000"
              className="flex h-11 items-center justify-center gap-2 rounded-[4px] border border-primary/30 bg-primary/5 text-sm font-bold uppercase tracking-[0.08em] text-primary"
            >
              <PhoneCall className="h-4 w-4" />
              Call us instead
            </a>
            <Link
              to="/"
              className="flex h-11 items-center justify-center rounded-[4px] border border-border text-sm font-semibold"
            >
              Continue shopping
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes wiggle {
          0%,100% { transform: rotate(-8deg); }
          50% { transform: rotate(8deg); }
        }
      `}</style>
    </div>
  );
}
