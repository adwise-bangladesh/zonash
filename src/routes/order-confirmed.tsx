import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { CheckCircle2, PackageCheck, Sparkles } from "lucide-react";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";

const searchSchema = z.object({
  id: z.number().optional(),
  number: z.string().optional(),
  total: z.string().optional(),
});

export const Route = createFileRoute("/order-confirmed")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Order confirmed — Zonash" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Confirmed,
});

function Confirmed() {
  const { number } = Route.useSearch();
  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/30">
      <CheckoutHeader title="Order confirmed" />
      <div className="mx-auto w-full max-w-md flex-1 px-3 pt-8 pb-12">
        <div className="relative overflow-hidden rounded-[6px] border border-border bg-background p-6 text-center shadow-sm animate-in fade-in zoom-in-95 duration-500">
          {/* subtle confetti sparkles */}
          <Sparkles className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-primary/40 animate-pulse" />
          <Sparkles className="pointer-events-none absolute right-6 top-8 h-3 w-3 text-primary/30 animate-pulse [animation-delay:600ms]" />
          <Sparkles className="pointer-events-none absolute left-10 bottom-16 h-3 w-3 text-primary/30 animate-pulse [animation-delay:900ms]" />

          {/* Animated check */}
          <div className="relative mx-auto mb-5 h-24 w-24">
            <svg viewBox="0 0 96 96" className="h-24 w-24">
              <circle
                cx="48"
                cy="48"
                r="44"
                fill="none"
                stroke="hsl(var(--primary) / 0.2)"
                strokeWidth="2"
              />
              <circle
                cx="48"
                cy="48"
                r="44"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="276"
                strokeDashoffset="276"
                transform="rotate(-90 48 48)"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="276"
                  to="0"
                  dur="0.9s"
                  fill="freeze"
                />
              </circle>
              <path
                d="M30 50 L44 63 L68 37"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="60"
                strokeDashoffset="60"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="60"
                  to="0"
                  dur="0.5s"
                  begin="0.7s"
                  fill="freeze"
                />
              </path>
            </svg>
            <CheckCircle2 className="pointer-events-none absolute inset-0 m-auto h-0 w-0 opacity-0" />
          </div>

          <h1 className="font-display text-3xl leading-tight">Thank you!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Order <span className="font-semibold text-foreground">#{number ?? ""}</span> is
            confirmed. We're preparing your parcel now.
          </p>

          <div className="mt-5 flex items-center justify-center gap-2 rounded-[4px] border border-primary/20 bg-primary/5 px-3 py-2.5 text-[12.5px] text-primary">
            <PackageCheck className="h-4 w-4" />
            Cash on Delivery — pay only when the parcel arrives.
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <Link
              to="/products"
              className="flex h-11 items-center justify-center rounded-[4px] bg-primary text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground shadow-[var(--shadow-glow)]"
            >
              Continue shopping
            </Link>
            <Link
              to="/"
              className="flex h-11 items-center justify-center rounded-[4px] border border-border text-sm font-semibold"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
