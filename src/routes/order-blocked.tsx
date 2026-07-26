import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { ShieldAlert } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SupportFooter, buildSupportMessage } from "@/components/checkout/SupportFooter";
import { FlowIcon } from "@/components/checkout/FlowIcon";

const searchSchema = z.object({
  order: z.coerce.number().int().positive().optional(),
  number: z.coerce.string().optional(),
});

export const Route = createFileRoute("/order-blocked")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Order cannot be processed — Zonash" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Blocked,
});

function Blocked() {
  const { order, number } = Route.useSearch();
  const ref = number ?? (order ? String(order) : "");
  return (
    <div className="min-h-dvh bg-gradient-to-b from-background via-muted/40 to-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-md px-5 pb-10 pt-4">
        <div>
          <FlowIcon variant="warn" />

          <h1 className="text-center font-display text-4xl leading-tight animate-in fade-in slide-in-from-bottom-2 duration-500">
            We couldn't accept this order
          </h1>
          <p className="mt-2 text-center text-[13px] leading-relaxed text-muted-foreground">
            {ref ? (
              <>
                Order <span className="font-semibold text-foreground">#{ref}</span> has been
                cancelled by our system.
                <br />
              </>
            ) : null}
            Our fraud-prevention checks flagged this account, so no payment or delivery will be scheduled.
          </p>

          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-[12.5px] font-medium text-destructive">
            <ShieldAlert className="h-4 w-4" />
            Blocked by our security system
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-card p-4 text-[12.5px] leading-relaxed text-muted-foreground">
            If you believe this is a mistake, our team can review the decision. Please contact
            support with your order reference and a brief explanation — we'll get back to you as
            soon as we can.
          </div>

          <div className="mt-5 grid gap-2">
            <Link
              to="/"
              className="flex h-12 items-center justify-center rounded-2xl bg-primary text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground shadow-[var(--shadow-glow)]"
            >
              Back to home
            </Link>
          </div>
          <div className="mt-6 pb-[env(safe-area-inset-bottom)]">
            <SupportFooter
              label="Contact support"
              waMessage={buildSupportMessage({
                page: "Order blocked",
                orderNumber: ref,
                extra: `Order #${ref} was cancelled by the system. I'd like this decision reviewed.`,
              })}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
