import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Flame, Gift, CreditCard, TrendingUp, Crown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Promo =
  | { label: string; icon: LucideIcon; tint: string; to: "/c/$slug"; slug: string }
  | { label: string; icon: LucideIcon; tint: string; to: "/luxury" };

const promos: Promo[] = [
  {
    label: "Flash Deals",
    icon: Flame,
    tint: "bg-rose-50 text-rose-600 ring-rose-100",
    to: "/c/$slug",
    slug: "flash-deals",
  },
  {
    label: "Gift Boxes",
    icon: Gift,
    tint: "bg-sky-50 text-sky-600 ring-sky-100",
    to: "/c/$slug",
    slug: "gift-boxes",
  },
  {
    label: "Gift Cards",
    icon: CreditCard,
    tint: "bg-amber-50 text-amber-600 ring-amber-100",
    to: "/c/$slug",
    slug: "gift-cards",
  },
  {
    label: "Trending",
    icon: TrendingUp,
    tint: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    to: "/c/$slug",
    slug: "trending",
  },
  {
    label: "Luxury",
    icon: Crown,
    tint: "bg-primary/10 text-primary ring-primary/15",
    to: "/luxury",
  },
];

/**
 * Shortcut row.
 *
 * The slugs are hand-curated, but a hand-curated slug can be renamed, emptied
 * or deleted in WooCommerce at any time — and then the tile stayed on the
 * homepage and dropped visitors on an empty category page (a dead end on the
 * most trafficked screen, and a crawlable soft-404). When the category list is
 * available, tiles are matched against it and unknown slugs are hidden; during
 * a taxonomy outage the list arrives empty and every tile is kept, so a blip
 * cannot blank the row.
 */
export function PromoIcons({ categories }: { categories?: { slug?: string }[] }) {
  const visible = useMemo(() => {
    const known = new Set((categories ?? []).map((c) => c?.slug).filter(Boolean) as string[]);
    if (!known.size) return promos;
    const list = promos.filter((p) => p.to === "/luxury" || known.has(p.slug));
    // Never render an empty row: fall back to the full set rather than
    // collapsing the layout if nothing matched (e.g. a partial payload).
    return list.length ? list : promos;
  }, [categories]);

  return (
    <section aria-label="Shortcuts" className="bg-background pb-4 pt-2">
      <div className="container-page">
        <div
          className="mx-auto grid max-w-3xl gap-2 md:gap-6"
          style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}
        >
          {visible.map((promo) => {
            const { label, icon: Icon, tint } = promo;
            const linkProps =
              promo.to === "/luxury"
                ? ({ to: "/luxury" } as const)
                : ({ to: "/c/$slug", params: { slug: promo.slug } } as const);
            return (
              <Link key={label} {...linkProps} className="group flex flex-col items-center gap-2">
                <span
                  className={`grid h-14 w-14 place-items-center rounded-2xl ring-1 transition-all group-hover:-translate-y-0.5 group-hover:shadow-sm md:h-16 md:w-16 ${tint}`}
                >
                  <Icon className="h-6 w-6 md:h-7 md:w-7" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="text-[11px] font-medium text-foreground md:text-[13px]">
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
