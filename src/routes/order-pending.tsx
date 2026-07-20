import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { PhoneCall, Clock } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SupportFooter, buildSupportMessage } from "@/components/checkout/SupportFooter";
import { OrderSummaryCard } from "@/components/checkout/OrderSummaryCard";
import { FlowIcon } from "@/components/checkout/FlowIcon";

const searchSchema = z.object({
  order: z.coerce.number().int().positive(),
  number: z.coerce.string().optional(),
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
    <div className="min-h-dvh bg-gradient-to-b from-background via-muted/40 to-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-md px-5 pb-10 pt-4">
        <FlowIcon variant="static" icon={PhoneCall} />

        <h1 className="text-center text-2xl font-bold tracking-tight">Call verification required</h1>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-muted-foreground">
          Order <span className="font-semibold text-foreground">#{number ?? order}</span> is saved as pending.
          <br />
          Our team will call you shortly to confirm.
        </p>

        <div className="mt-5 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-3.5 text-left">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> What happens next
          </div>
          <ol className="mt-2 space-y-1.5 text-[12.5px] text-foreground/90">
            <li>1. We call the number you provided.</li>
            <li>2. Confirm items, address & delivery time.</li>
            <li>3. Parcel is dispatched — pay on arrival.</li>
          </ol>
        </div>

        <OrderSummaryCard orderId={order} />

        <Link
          to="/"
          className="mt-5 flex h-11 items-center justify-center rounded-2xl border border-border text-sm font-semibold"
        >
          Continue shopping
        </Link>
        <div className="mt-6">
          <SupportFooter
            label="Need to speak to us now?"
            waMessage={buildSupportMessage({
              page: "Order pending",
              orderNumber: number ?? order,
              extra: "I'd like to confirm my order sooner.",
            })}
          />
        </div>
      </main>
    </div>
  );
}
