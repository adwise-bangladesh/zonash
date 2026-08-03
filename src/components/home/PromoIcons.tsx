import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Flame, Gift, CreditCard, TrendingUp, Crown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Promo =
  | { label: string; icon: LucideIcon; tint: string; to: "/c/$slug"; slug: string }
  | { label: string; icon: LucideIcon; tint: string; to: "/luxury" }
  | { label: string; icon: LucideIcon; tint: string; to: "/products"; q: string };


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
 * Slugs that always link straight to their category page, even when the
 * homepage's category list (top-level only) doesn't mention them.
 */
const PINNED_SLUGS = new Set(["gift-boxes", "gift-cards"]);


/**
 * Shortcut row.
 *
 * All five curated tiles always render — they are part of the brand's homepage
 * identity. A curated slug can be renamed, emptied or deleted in WooCommerce at
 * any time, and linking to a missing category is a dead end / soft-404. So the
 * tile is kept but re-pointed: when its slug is not in the live category list,
 * it links to the shop filtered by its label instead, which always resolves to
 * a real page with results or a proper empty state.
 *
 * During a taxonomy outage the list arrives empty and every curated tile keeps
 * its category link, so a blip cannot reshuffle the row.
 */
export function PromoIcons({
  categories,
}: {
  categories?: { slug?: string; name?: string }[];
}) {
  const visible = useMemo(() => {
    const cats = (categories ?? []).filter((c) => c?.slug && c?.name);
    if (!cats.length) return promos;

    const known = new Set(cats.map((c) => c.slug as string));
    return promos.map<Promo>((p) => {
      if (p.to !== "/c/$slug" || known.has(p.slug) || PINNED_SLUGS.has(p.slug)) return p;
      return { label: p.label, icon: p.icon, tint: p.tint, to: "/products", q: p.label };
    });
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
                : promo.to === "/products"
                  ? ({ to: "/products", search: { q: promo.q } } as const)
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
