import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { PackageCheck } from "lucide-react";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { SupportFooter, buildSupportMessage } from "@/components/checkout/SupportFooter";
import { OrderSummaryCard } from "@/components/checkout/OrderSummaryCard";
import { FlowIcon } from "@/components/checkout/FlowIcon";

const searchSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  number: z.coerce.string().optional(),
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
  const { id, number } = Route.useSearch();
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-gradient-to-b from-background via-muted/40 to-background">
      <CheckoutHeader title="Order confirmed" />

      <main className="relative flex flex-1 flex-col px-5 pb-4 pt-2">
        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          <FlowIcon variant="check" />

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

          {id ? <OrderSummaryCard orderId={id} /> : null}

          <div className="mt-5 grid gap-2">
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
          <div className="mt-6 pb-[env(safe-area-inset-bottom)]">
            <SupportFooter
              waMessage={buildSupportMessage({
                page: "Order confirmed",
                orderNumber: number ?? "",
                extra: `Order #${number ?? ""} — I need help with this confirmed order.`,
              })}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
