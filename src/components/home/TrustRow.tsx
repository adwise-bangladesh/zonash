import { Banknote, RotateCcw, Truck, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { RETURNS_LABEL } from "@/lib/site";

const items: { title: string; icon: LucideIcon }[] = [
  { title: "Cash on Delivery", icon: Banknote },
  { title: RETURNS_LABEL, icon: RotateCcw },
  { title: "24h Delivery", icon: Truck },
  { title: "100% Authentic", icon: ShieldCheck },
];

export function TrustRow() {
  return (
    <section aria-labelledby="trust-heading" className="bg-background pb-8 pt-4">
      <div className="container-page">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
          <h2
            id="trust-heading"
            className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
          >
            Why shop with Zonash
          </h2>
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
        </div>

        <ul className="mx-auto mt-4 flex max-w-md items-start justify-between gap-2">
          {items.map(({ title, icon: Icon }) => (
            <li key={title} className="flex flex-1 flex-col items-center gap-1.5 text-center">
              <Icon className="h-4 w-4 text-primary" aria-hidden="true" strokeWidth={1.75} />
              <span className="text-[10px] font-medium leading-tight text-muted-foreground">
                {title}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70">
          — Zonash · Dhaka —
        </p>
      </div>
    </section>
  );
}
