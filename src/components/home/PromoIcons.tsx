import { Link } from "@tanstack/react-router";
import { Flame, Gift, CreditCard, TrendingUp, Crown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Promo = {
  label: string;
  icon: LucideIcon;
  tint: string;
  to: string;
  search?: Record<string, unknown>;
};

const promos: Promo[] = [
  { label: "Flash Deals", icon: Flame, tint: "bg-rose-50 text-rose-600 ring-rose-100", to: "/c/$slug", search: undefined },
  { label: "Gift Boxes", icon: Gift, tint: "bg-sky-50 text-sky-600 ring-sky-100", to: "/c/$slug" },
  { label: "Gift Cards", icon: CreditCard, tint: "bg-amber-50 text-amber-600 ring-amber-100", to: "/c/$slug" },
  { label: "Trending", icon: TrendingUp, tint: "bg-emerald-50 text-emerald-600 ring-emerald-100", to: "/c/$slug" },
  { label: "Luxury", icon: Crown, tint: "bg-primary/10 text-primary ring-primary/15", to: "/luxury" },
];

const promoParams: Record<string, { slug: string }> = {
  "Flash Deals": { slug: "flash-deals" },
  "Gift Boxes": { slug: "gift-boxes" },
  "Gift Cards": { slug: "gift-cards" },
  Trending: { slug: "trending" },
};

export function PromoIcons() {
  return (
    <section aria-label="Shortcuts" className="bg-background pb-4 pt-2">
      <div className="container-page">
        <div className="mx-auto grid max-w-3xl grid-cols-5 gap-2 md:gap-6">
          {promos.map(({ label, icon: Icon, tint, to, search }) => (
            <Link
              key={label}
              to={to}
              params={promoParams[label] as never}
              search={search as never}
              className="group flex flex-col items-center gap-2"
            >
              <span
                className={`grid h-14 w-14 place-items-center rounded-2xl ring-1 transition-all group-hover:-translate-y-0.5 group-hover:shadow-sm md:h-16 md:w-16 ${tint}`}
              >
                <Icon
                  className={`h-6 w-6 md:h-7 md:w-7 ${label === "Flash Deals" ? "flame-flicker fill-current" : ""}`}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </span>
              <span className="text-[11px] font-medium text-foreground md:text-[13px]">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
