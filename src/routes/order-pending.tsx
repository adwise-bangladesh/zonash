import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { PhoneCall, Clock } from "lucide-react";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { SupportFooter, buildSupportMessage } from "@/components/checkout/SupportFooter";
import { FlowIcon } from "@/components/checkout/FlowIcon";

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
          <FlowIcon variant="static" icon={PhoneCall} />

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
          <div className="mt-6 pb-[env(safe-area-inset-bottom)]">
            <SupportFooter
              label="Need to speak to us now?"
              waMessage={buildSupportMessage({
                page: "Order pending",
                orderNumber: number ?? order,
                extra: "I'd like to confirm my order sooner.",
              })}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
