import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { Phone, PhoneOff, Loader2 } from "lucide-react";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { SupportFooter, buildSupportMessage } from "@/components/checkout/SupportFooter";
import { OrderSummaryCard } from "@/components/checkout/OrderSummaryCard";
import { FlowIcon } from "@/components/checkout/FlowIcon";
import { ShieldCheck } from "lucide-react";

import { finalizeOrderChoice } from "@/lib/otp.functions";

const searchSchema = z.object({
  order: z.coerce.number().int().positive(),
  number: z.coerce.string().optional(),
});

export const Route = createFileRoute("/order-callback-choice")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Confirm your order — Zonash" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CallbackChoicePage,
});

function CallbackChoicePage() {
  const navigate = useNavigate();
  const { order, number } = Route.useSearch();
  const finalizeFn = useServerFn(finalizeOrderChoice);
  const [busy, setBusy] = useState<null | "yes" | "no">(null);

  const choose = async (wants_call: boolean) => {
    if (busy) return;
    setBusy(wants_call ? "yes" : "no");
    try {
      const res = await finalizeFn({ data: { order_id: order, wants_call } });
      if (!res.ok) {
        toast.error(res.error);
        setBusy(null);
        return;
      }
      if (res.decision === "confirmed") {
        navigate({ to: "/order-confirmed", search: { id: order, number: number ?? String(order), total: "" } as never });
      } else {
        navigate({ to: "/order-pending", search: { order, number: number ?? String(order) } as never });
      }
    } catch (e) {
      console.error(e);
      toast.error("Something went wrong. Please try again.");
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-gradient-to-b from-background via-muted/40 to-background">
      <CheckoutHeader title="Almost done" />

      <main className="relative flex flex-1 flex-col px-5 pb-4 pt-2">
        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          <FlowIcon variant="static" icon={ShieldCheck} />

          <h1 className="text-center text-2xl font-bold tracking-tight">Verification complete</h1>
          <p className="mt-2 text-center text-[13px] leading-relaxed text-muted-foreground">
            One last step for order{" "}
            <span className="font-semibold text-foreground">#{number ?? order}</span>.
            <br />
            Do you want us to call and confirm first?
          </p>

          <OrderSummaryCard orderId={order} />

          <div className="mt-5 grid gap-2.5">
            <button
              onClick={() => choose(true)}
              disabled={!!busy}
              className="group flex h-16 items-center gap-3 rounded-2xl border-2 border-amber-500/50 bg-amber-500/5 px-4 text-left transition-all hover:border-amber-500 hover:bg-amber-500/10 disabled:opacity-60"
            >
              <span className="grid h-11 w-11 place-items-center rounded-full bg-amber-500/15">
                {busy === "yes" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-amber-700" />
                ) : (
                  <Phone className="h-5 w-5 text-amber-700" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">Yes, please call me</div>
                <div className="text-[11px] text-muted-foreground">Order stays pending until we speak</div>
              </div>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                Pending
              </span>
            </button>

            <button
              onClick={() => choose(false)}
              disabled={!!busy}
              className="group relative flex h-16 items-center gap-3 overflow-hidden rounded-2xl bg-primary px-4 text-left text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:brightness-110 disabled:opacity-60"
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <span className="relative grid h-11 w-11 place-items-center rounded-full bg-white/15">
                {busy === "no" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <PhoneOff className="h-5 w-5" />
                )}
              </span>
              <div className="relative min-w-0 flex-1">
                <div className="text-sm font-bold uppercase tracking-wide">Confirm order now</div>
                <div className="text-[11px] opacity-90">Ship straight away — no call needed</div>
              </div>
            </button>
          </div>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
            Cash on Delivery · Pay only when the parcel arrives.
          </p>
          <div className="mt-6 pb-[env(safe-area-inset-bottom)]">
            <SupportFooter
              waMessage={buildSupportMessage({
                page: "Callback choice",
                orderNumber: number ?? order,
                phone: number,
                extra: `Order #${number ?? order} — deciding between a call-back and confirming now.`,
              })}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

