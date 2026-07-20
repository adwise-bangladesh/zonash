import { Link } from "@tanstack/react-router";
import { Flame, Gift, Sparkles, Ticket, Crown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Promo = {
  label: string;
  sub?: string;
  icon: LucideIcon;
  bg: string;
  fg: string;
  badge?: string;
  to: string;
  search?: Record<string, unknown>;
};

const promos: Promo[] = [
  {
    label: "Flash Deals",
    icon: Flame,
    bg: "bg-gradient-to-br from-rose-500 to-primary",
    fg: "text-white",
    badge: "1 Tk",
    to: "/products",
    search: { orderby: "popularity" },
  },
  {
    label: "Gift Cards",
    icon: Gift,
    bg: "bg-gradient-to-br from-sky-400 to-blue-600",
    fg: "text-white",
    to: "/products",
  },
  {
    label: "Spin & Win",
    icon: Ticket,
    bg: "bg-gradient-to-br from-amber-400 to-orange-500",
    fg: "text-white",
    to: "/products",
  },
  {
    label: "Freebies",
    icon: Sparkles,
    bg: "bg-gradient-to-br from-emerald-400 to-emerald-600",
    fg: "text-white",
    to: "/products",
  },
  {
    label: "Luxury",
    sub: "Premium",
    icon: Crown,
    bg: "bg-gradient-to-br from-primary to-[#5a0b0c]",
    fg: "text-white",
    badge: "New",
    to: "/products",
    search: { featured: true },
  },
];

export function PromoIcons() {
  return (
    <section aria-label="Promotions" className="bg-background pb-3 pt-1">
      <div className="grid grid-cols-5 gap-2 px-3 md:container-page md:gap-4">
        {promos.map(({ label, icon: Icon, bg, fg, badge, to, search }) => (
          <Link
            key={label}
            to={to}
            search={search as never}
            className="group flex flex-col items-center gap-1.5"
          >
            <span
              className={`relative grid h-14 w-14 place-items-center rounded-2xl shadow-sm transition-transform group-hover:-translate-y-0.5 md:h-16 md:w-16 ${bg} ${fg}`}
            >
              <Icon className="h-6 w-6 md:h-7 md:w-7" aria-hidden="true" />
              {badge && (
                <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground shadow">
                  {badge}
                </span>
              )}
            </span>
            <span className="text-[11px] font-medium text-foreground md:text-xs">{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
