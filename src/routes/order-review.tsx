import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { AlertTriangle, Phone } from "lucide-react";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
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
    <div className="flex min-h-[100dvh] flex-col bg-muted/30">
      <CheckoutHeader title="Order under review" />
      <div className="mx-auto w-full max-w-md flex-1 px-3 pt-8 pb-12">
        <div className="rounded-[4px] border border-border bg-background p-6 shadow-sm">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-amber-500/10">
            <AlertTriangle className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="text-center text-lg font-bold">We're reviewing your order</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Order <span className="font-semibold">#{order}</span> has been received and is
            pending a quick review by our team. We'll call you within a few hours to
            confirm delivery details.
          </p>

          {reason && (
            <div className="mt-4 rounded-[3px] bg-amber-500/5 px-3 py-2.5 text-center text-[12px] text-amber-800">
              {reason}
            </div>
          )}

          {dups.length > 0 && (
            <div className="mt-4 rounded-[3px] border border-dashed border-border p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Existing active orders on this number
              </div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {dups.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        #{d.number}{" "}
                        <span className="text-[11px] font-normal text-muted-foreground">
                          · {d.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(d.date_created).toLocaleString()}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-primary">
                      {formatBDT(Number(d.total))}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                If any of these are yours already, no action needed — our team will
                confirm which order to keep.
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <a
              href="tel:+8801700000000"
              className="flex h-11 items-center justify-center gap-2 rounded-[4px] bg-primary text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground"
            >
              <Phone className="h-4 w-4" />
              Call support
            </a>
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
