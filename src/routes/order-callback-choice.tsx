import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { Phone, PhoneOff, Loader2, BadgeCheck } from "lucide-react";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { finalizeOrderChoice } from "@/lib/otp.functions";

const searchSchema = z.object({
  order: z.coerce.number().int().positive(),
  number: z.string().optional(),
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
        navigate({
          to: "/order-confirmed",
          search: { number: number ?? String(order), total: "" } as never,
        });
      } else {
        navigate({
          to: "/order-pending",
          search: { order, number: number ?? String(order) } as never,
        });
      }
    } catch (e) {
      console.error(e);
      toast.error("Something went wrong. Please try again.");
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/30">
      <CheckoutHeader title="Almost done" />
      <div className="mx-auto w-full max-w-md flex-1 px-3 pt-8 pb-12">
        <div className="rounded-[6px] border border-border bg-background p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
          {/* Animated verified emblem */}
          <div className="relative mx-auto mb-5 grid h-20 w-20 place-items-center">
            <span className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
            <span className="absolute inset-2 rounded-full bg-primary/15" />
            <BadgeCheck className="relative h-10 w-10 text-primary drop-shadow" />
          </div>

          <h1 className="text-center text-xl font-bold tracking-tight">
            Verification complete
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            One last step for order{" "}
            <span className="font-semibold text-foreground">#{number ?? order}</span>.
            <br />
            Do you want us to call and confirm your order first?
          </p>

          <div className="mt-6 grid gap-2.5">
            <button
              onClick={() => choose(true)}
              disabled={!!busy}
              className="group flex h-14 items-center justify-between gap-3 rounded-[6px] border-2 border-amber-500/50 bg-amber-500/5 px-4 text-left transition-all hover:border-amber-500 hover:bg-amber-500/10 disabled:opacity-60"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-amber-500/15">
                  {busy === "yes" ? (
                    <Loader2 className="h-5 w-5 animate-spin text-amber-700" />
                  ) : (
                    <Phone className="h-5 w-5 text-amber-700" />
                  )}
                </span>
                <div>
                  <div className="text-sm font-bold">Yes, please call me</div>
                  <div className="text-[11px] text-muted-foreground">
                    Order stays pending until we speak
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                Pending
              </span>
            </button>

            <button
              onClick={() => choose(false)}
              disabled={!!busy}
              className="group relative flex h-14 items-center justify-between gap-3 overflow-hidden rounded-[6px] bg-primary px-4 text-left text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:brightness-110 disabled:opacity-60"
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <div className="relative flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15">
                  {busy === "no" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <PhoneOff className="h-5 w-5" />
                  )}
                </span>
                <div>
                  <div className="text-sm font-bold uppercase tracking-wide">
                    No, confirm my order now
                  </div>
                  <div className="text-[11px] opacity-90">
                    Ship straight away — no call needed
                  </div>
                </div>
              </div>
            </button>
          </div>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
            Cash on Delivery · You only pay when the parcel arrives at your door.
          </p>
        </div>
      </div>
    </div>
  );
}
