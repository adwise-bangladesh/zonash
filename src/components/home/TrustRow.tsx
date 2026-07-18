import { Banknote, RotateCcw, Truck, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const items: { title: string; desc: string; icon: LucideIcon }[] = [
  { title: "Cash on Delivery", desc: "Pay when it arrives", icon: Banknote },
  { title: "7-Day Returns", desc: "Hassle-free refunds", icon: RotateCcw },
  { title: "Fast Delivery", desc: "Dhaka within 24h", icon: Truck },
  { title: "Verified Craft", desc: "100% authentic", icon: ShieldCheck },
];

export function TrustRow() {
  return (
    <section aria-labelledby="trust-heading" className="bg-background py-8 md:py-12">
      <div className="container-page">
        <h2
          id="trust-heading"
          className="mb-4 text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground md:mb-6 md:text-base"
        >
          Why shop with Zonash
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          {items.map(({ title, desc, icon: Icon }) => (
            <div
              key={title}
              className="flex flex-col items-center gap-2 rounded-[3px] bg-surface-muted p-3 text-center md:p-5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[3px] bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-semibold text-ink md:text-sm">{title}</p>
                <p className="text-[11px] text-muted-foreground md:text-xs">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
