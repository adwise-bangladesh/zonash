import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { PackageCheck } from "lucide-react";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { SupportFooter } from "@/components/checkout/SupportFooter";

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
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-gradient-to-b from-background via-muted/40 to-background">
      <CheckoutHeader title="Order confirmed" />

      <main className="relative flex flex-1 flex-col px-5 pb-4 pt-2">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-6 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

        {/* floating sparkles */}
        <span aria-hidden className="pointer-events-none absolute left-8 top-24 h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse" />
        <span aria-hidden className="pointer-events-none absolute right-10 top-32 h-1 w-1 rounded-full bg-primary/50 animate-pulse [animation-delay:600ms]" />
        <span aria-hidden className="pointer-events-none absolute left-14 top-48 h-1 w-1 rounded-full bg-primary/40 animate-pulse [animation-delay:900ms]" />
        <span aria-hidden className="pointer-events-none absolute right-16 top-56 h-1.5 w-1.5 rounded-full bg-primary/50 animate-pulse [animation-delay:400ms]" />

        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          {/* Animated check */}
          <div className="relative mx-auto mb-6 h-28 w-28">
            <svg viewBox="0 0 112 112" className="h-28 w-28">
              <circle cx="56" cy="56" r="52" fill="hsl(var(--primary) / 0.08)" />
              <circle
                cx="56"
                cy="56"
                r="48"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="302"
                strokeDashoffset="302"
                transform="rotate(-90 56 56)"
              >
                <animate attributeName="stroke-dashoffset" from="302" to="0" dur="0.9s" fill="freeze" />
              </circle>
              <path
                d="M34 58 L50 74 L80 42"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="70"
                strokeDashoffset="70"
              >
                <animate attributeName="stroke-dashoffset" from="70" to="0" dur="0.5s" begin="0.7s" fill="freeze" />
              </path>
            </svg>
          </div>

          <h1 className="text-center font-display text-4xl leading-tight animate-in fade-in slide-in-from-bottom-2 duration-500">
            Thank you!
          </h1>
          <p className="mt-2 text-center text-[13px] leading-relaxed text-muted-foreground">
            Order <span className="font-semibold text-foreground">#{number ?? ""}</span> is confirmed.
            <br />
            We're preparing your parcel now.
          </p>

          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-[12.5px] font-medium text-primary">
            <PackageCheck className="h-4 w-4" />
            Cash on Delivery — pay only on arrival
          </div>

          <div className="mt-6 grid gap-2">
            <Link
              to="/products"
              className="flex h-12 items-center justify-center rounded-2xl bg-primary text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground shadow-[var(--shadow-glow)]"
            >
              Continue shopping
            </Link>
            <Link
              to="/"
              className="flex h-11 items-center justify-center rounded-2xl border border-border text-sm font-semibold"
            >
              Back to home
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md pb-[env(safe-area-inset-bottom)]">
          <SupportFooter />
        </div>
      </main>
    </div>
  );
}
