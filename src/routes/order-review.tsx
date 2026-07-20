import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { AlertTriangle } from "lucide-react";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { SupportFooter } from "@/components/checkout/SupportFooter";
import { formatBDT } from "@/lib/format";

const searchSchema = z.object({
  order: z.coerce.number().int().positive(),
  reason: z.string().optional().default(""),
  duplicates: z.string().optional().default("[]"),
});

type Dup = {
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  match?: string[];
};

export const Route = createFileRoute("/order-review")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Order under review — Zonash" },
      { name: "description", content: "Your Zonash order is with our team for a quick review." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderReviewPage,
});

function OrderReviewPage() {
  const { order, reason, duplicates: dupJson } = Route.useSearch();
  let dups: Dup[] = [];
  try {
    dups = JSON.parse(dupJson) as Dup[];
  } catch {
    /* ignore */
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-gradient-to-b from-background via-muted/40 to-background">
      <CheckoutHeader title="Order under review" />

      <main className="relative flex flex-1 flex-col px-5 pb-4 pt-2">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-8 h-64 w-64 -translate-x-1/2 rounded-full bg-amber-400/15 blur-3xl" />

        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          {/* Animated warning */}
          <div className="relative mx-auto mb-5 grid h-24 w-24 place-items-center">
            <span className="absolute inset-0 rounded-full bg-amber-500/10 animate-ping" />
            <span className="absolute inset-3 rounded-full bg-amber-500/20" />
            <AlertTriangle className="relative h-12 w-12 text-amber-600 animate-in zoom-in-50 duration-500" />
          </div>

          <h1 className="text-center text-2xl font-bold tracking-tight">Reviewing your order</h1>
          <p className="mt-2 text-center text-[13px] leading-relaxed text-muted-foreground">
            Order <span className="font-semibold text-foreground">#{order}</span> is pending a quick review.
            <br />
            We'll call you shortly to confirm.
          </p>

          {reason && (
            <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-center text-[12px] font-medium text-amber-800">
              {reason}
            </div>
          )}

          {dups.length > 0 && (
            <div className="mt-4 max-h-[30vh] overflow-y-auto rounded-2xl border border-dashed border-border p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Active orders on this number
              </div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {dups.slice(0, 4).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        #{d.number}{" "}
                        <span className="text-[11px] font-normal text-muted-foreground">· {d.status}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(d.date_created).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-primary">
                      {formatBDT(Number(d.total))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Link
            to="/"
            className="mt-5 flex h-11 items-center justify-center rounded-2xl border border-border text-sm font-semibold"
          >
            Back to home
          </Link>
        </div>

        <div className="relative mx-auto w-full max-w-md pb-[env(safe-area-inset-bottom)]">
          <SupportFooter label="Talk to our team" />
        </div>
      </main>
    </div>
  );
}
