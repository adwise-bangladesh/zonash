import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import {
  Check,
  Clock,
  Loader2,
  Phone,
  PhoneOff,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { SupportFooter, buildSupportMessage } from "@/components/checkout/SupportFooter";
import { OrderSummaryCard } from "@/components/checkout/OrderSummaryCard";
import { getOrderTimeline, type TimelineStage } from "@/lib/order-timeline.functions";
import { finalizeOrderChoice } from "@/lib/otp.functions";

const searchSchema = z.object({
  order: z.coerce.number().int().positive(),
  number: z.coerce.string().optional(),
});

export const Route = createFileRoute("/order-status")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Order status — Zonash" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderStatusPage,
});

function OrderStatusPage() {
  const { order, number } = Route.useSearch();
  const qc = useQueryClient();
  const timelineFn = useServerFn(getOrderTimeline);
  const finalizeFn = useServerFn(finalizeOrderChoice);
  const [busy, setBusy] = useState<null | "yes" | "no">(null);

  const queryKey = ["order-timeline", order] as const;
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => timelineFn({ data: { id: order } }),
    staleTime: 10_000,
  });
  const t = data?.timeline ?? null;

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
      await qc.invalidateQueries({ queryKey });
      await qc.invalidateQueries({ queryKey: ["public-order", order] });
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const ref = t?.number ?? number ?? String(order);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-background via-muted/40 to-background">
      <CheckoutHeader title="Order status" />

      <main className="mx-auto w-full max-w-md flex-1 px-5 pb-10 pt-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Order
              </div>
              <div className="truncate text-lg font-bold">#{ref}</div>
            </div>
            <StatusPill label={t?.statusLabel} stage={t?.stage} loading={isLoading} />
          </div>
          {t ? (
            <div className="mt-2 text-[11.5px] text-muted-foreground">
              Stage: <span className="font-semibold text-foreground">{t.stageLabel}</span>
            </div>
          ) : null}
        </div>

        {t?.awaiting_call_choice ? (
          <section className="mt-3 rounded-2xl border border-primary/25 bg-primary/[0.04] p-4">
            <p className="text-[13px] font-semibold">Do you want a confirmation call first?</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Choose one to finish. Cash on Delivery — pay only when the parcel arrives.
            </p>
            <div className="mt-3 grid gap-2">
              <button
                onClick={() => choose(false)}
                disabled={!!busy}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[13px] font-bold uppercase tracking-wide text-primary-foreground disabled:opacity-60"
              >
                {busy === "no" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PhoneOff className="h-4 w-4" />
                )}
                Confirm order now
              </button>
              <button
                onClick={() => choose(true)}
                disabled={!!busy}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-background text-[13px] font-semibold disabled:opacity-60"
              >
                {busy === "yes" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Phone className="h-4 w-4" />
                )}
                Call me before dispatch
              </button>
            </div>
          </section>
        ) : null}

        <section className="mt-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Timeline
          </div>
          {isLoading ? (
            <TimelineSkeleton />
          ) : t ? (
            <ol className="mt-3">
              {t.stages.map((s, i) => (
                <StageRow key={s.key} stage={s} last={i === t.stages.length - 1} />
              ))}
            </ol>
          ) : (
            <div className="mt-3">
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                Sign in with your mobile number to see this order's history. Your order is safe —
                reference #{ref}.
              </p>
              <Link
                to="/orders"
                className="mt-3 flex h-11 items-center justify-center rounded-2xl border border-border text-sm font-semibold"
              >
                Verify my number
              </Link>
            </div>
          )}
        </section>

        <OrderSummaryCard orderId={order} />

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
            label="Need help with this order?"
            chatTopic={`Order #${ref}`}
            waMessage={buildSupportMessage({
              page: "Order status",
              orderNumber: ref,
              extra: `Order #${ref} — status: ${t?.statusLabel ?? "unknown"}.`,
            })}
          />
        </div>
      </main>
    </div>
  );
}

function StatusPill({
  label,
  stage,
  loading,
}: {
  label?: string;
  stage?: WorkflowStage;
  loading: boolean;
}) {
  if (loading) {
    return <span className="h-7 w-24 animate-pulse rounded-full bg-muted" />;
  }
  const bad = stage === "cancelled" || stage === "failed" || stage === "returns";
  const good = stage === "delivered" || stage === "shipping" || stage === "fulfillment";
  const cls = bad
    ? "border-destructive/25 bg-destructive/10 text-destructive"
    : good
      ? "border-primary/25 bg-primary/10 text-primary"
      : "border-amber-500/30 bg-amber-500/10 text-amber-700";
  return (
    <span
      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${cls}`}
    >
      {label ?? "—"}
    </span>
  );
}

function StageRow({ stage, last }: { stage: TimelineStage; last: boolean }) {
  const done = stage.state === "done";
  const current = stage.state === "current";
  const bad =
    stage.key === "cancelled" || stage.key === "failed" || stage.key === "returns";
  const dot = bad
    ? "border-destructive/40 bg-destructive/10 text-destructive"
    : done
      ? "border-primary/30 bg-primary/10 text-primary"
      : current
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
        : "border-border bg-muted text-muted-foreground";

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!last && (
        <span
          aria-hidden
          className="absolute left-[13px] top-7 bottom-1 w-px bg-border"
        />
      )}
      <span className={`z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border ${dot}`}>
        {cancelled ? (
          <XCircle className="h-3.5 w-3.5" />
        ) : done ? (
          <Check className="h-3.5 w-3.5" />
        ) : current ? (
          <Clock className="h-3.5 w-3.5" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        )}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div
          className={`text-[13px] font-bold ${stage.state === "upcoming" ? "text-muted-foreground" : ""}`}
        >
          {stage.label}
        </div>
        {stage.events.length > 0 ? (
          <ul className="mt-1.5 space-y-2">
            {stage.events.map((e, i) => (
              <li key={i} className="rounded-xl bg-muted/40 px-3 py-2">
                <div className="flex items-start gap-1.5">
                  {e.tone === "warn" ? (
                    <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" />
                  ) : e.tone === "danger" ? (
                    <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" />
                  ) : null}
                  <span className="text-[12.5px] font-semibold">{e.title}</span>
                </div>
                {e.detail && (
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                    {e.detail}
                  </p>
                )}
                {e.at && (
                  <p className="mt-0.5 text-[10.5px] text-muted-foreground">{formatAt(e.at)}</p>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function formatAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TimelineSkeleton() {
  return (
    <div className="mt-3 space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <span className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <span className="block h-3 w-24 animate-pulse rounded bg-muted" />
            <span className="block h-10 w-full animate-pulse rounded-xl bg-muted/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
