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
    <section aria-labelledby="trust-heading" className="bg-background py-8 md:py-10">
      <div className="container-page">
        <div className="mb-5 flex flex-col items-center gap-1.5 text-center">
          <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span className="h-px w-6 bg-primary/40" aria-hidden="true" />
            The Zonash Promise
            <span className="h-px w-6 bg-primary/40" aria-hidden="true" />
          </span>
          <h2 id="trust-heading" className="text-base font-semibold text-ink md:text-lg">
            Why shop with Zonash
          </h2>
          <p className="max-w-xs text-[11px] leading-relaxed text-muted-foreground md:text-xs">
            Trusted by thousands of shoppers across Bangladesh
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          {items.map(({ title, desc, icon: Icon }) => (
            <div
              key={title}
              className="group relative overflow-hidden rounded-[6px] border border-border/60 bg-surface-muted/50 p-3.5 text-center transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-surface-muted hover:shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] md:p-4"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden="true" />
              <span className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-inset ring-primary/10 transition-transform duration-300 group-hover:scale-105">
                <Icon className="h-5 w-5" aria-hidden="true" strokeWidth={1.75} />
              </span>
              <p className="text-[12px] font-semibold leading-tight text-ink md:text-sm">{title}</p>
              <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground md:text-[11px]">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
