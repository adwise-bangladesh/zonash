import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Flame, Gift, CreditCard, TrendingUp, Crown, Sparkles, Gem, Heart, Star } from "lucide-react";
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

/** Slugs that already own a tab in `CategoryTabs` or are not browsable. */
const NOT_SHORTCUTTABLE = new Set([
  "new-arrivals",
  "bestsellers",
  "mega-sale",
  "uncategorized",
]);

/** Icon/tint palette for tiles backfilled from the real category list. */
const FILL_STYLES: { icon: LucideIcon; tint: string }[] = [
  { icon: Sparkles, tint: "bg-rose-50 text-rose-600 ring-rose-100" },
  { icon: Gem, tint: "bg-sky-50 text-sky-600 ring-sky-100" },
  { icon: Heart, tint: "bg-amber-50 text-amber-600 ring-amber-100" },
  { icon: Star, tint: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
];

const SLOTS = 5;

/**
 * Shortcut row.
 *
 * The slugs are hand-curated, but a curated slug can be renamed, emptied or
 * deleted in WooCommerce at any time — and then the tile stayed on the homepage
 * and dropped visitors on an empty category page: a dead end on the most
 * trafficked screen, and a crawlable soft-404. (On this store four of the five
 * tiles pointed at categories that do not exist.)
 *
 * Tiles are now matched against the real category list; unknown ones are
 * dropped and the free slots are backfilled with the store's top categories, so
 * the row keeps its five-up rhythm and every tile leads somewhere with stock.
 * During a taxonomy outage the list arrives empty and the curated set is kept
 * as-is, so a blip cannot blank or reshuffle the row.
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
    const used = new Set<string>();
    const out: Promo[] = [];
    for (const p of promos) {
      if (p.to === "/luxury" || known.has(p.slug)) {
        out.push(p);
        if (p.to !== "/luxury") used.add(p.slug);
      }
    }

    let i = 0;
    for (const c of cats) {
      if (out.length >= SLOTS) break;
      const slug = c.slug as string;
      if (used.has(slug) || NOT_SHORTCUTTABLE.has(slug)) continue;
      used.add(slug);
      const style = FILL_STYLES[i++ % FILL_STYLES.length]!;
      out.push({ label: c.name as string, icon: style.icon, tint: style.tint, to: "/c/$slug", slug });
    }

    return out.length ? out : promos;
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
