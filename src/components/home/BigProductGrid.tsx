import { Link } from "@tanstack/react-router";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Gem } from "lucide-react";
import { formatBDT } from "@/lib/format";
import { cardTitle } from "@/lib/card-title";
import { beginProductPush } from "@/lib/nav-transition";
import { resolveCardPrices } from "@/lib/price-range";
import { buildResponsiveImage, onImageSrcSetError } from "@/lib/product-image";
import { useSeedProductCache } from "@/lib/seed-product-cache";
import { sortStorefrontProducts } from "@/lib/stock-order";
import { readRecentlyViewed } from "@/lib/recently-viewed";
import type { WooProduct } from "@/lib/woo.server";


// Memoized: the feed grows to 180+ cards, and any parent state change
// (scroll sentinel, tab switch, timer elsewhere) would otherwise re-render
// every card and recompute its price/srcset.
const BigCard = memo(function BigCard({
  p,
  priority,
  columns,
  onSeed,
}: {
  p: WooProduct;
  priority: boolean;
  columns: 2 | 3;
  onSeed: (p: WooProduct) => void;
}) {
  const { sell, regular } = resolveCardPrices(p);
  const rating = Number.parseFloat(String(p.average_rating ?? ""));
  const soldish = p.rating_count ?? 0;
  const image = p.images?.[0];
  const availability = availabilityOf(p);
  const seed = () => onSeed(p);
  const imgRef = useRef<HTMLImageElement>(null);

  // The storefront is capped at a 480px frame, so a card column never exceeds
  // ~240px. Without a srcset the browser downloaded the full-size WordPress
  // original (often 1000px+) for every card in the feed.
  const responsive = buildResponsiveImage(image, {
    sizes: columns === 3 ? "(min-width: 480px) 160px, 33vw" : "(min-width: 480px) 240px, 50vw",
  });

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      preload="intent"
      data-vr="feed-card-live"

      onPointerDown={(e) => {
        if (e.button !== 0) return;
        seed();
        // Morph this card's image into the product hero. Marked imperatively on
        // pointerdown: the same product can appear in both Mega Sale and the
        // feed, and two elements sharing a view-transition-name kills it.
        beginProductPush(imgRef.current);
      }}
      onFocus={seed}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-border/60 transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden bg-surface-muted">
        {responsive ? (
          <img
            ref={imgRef}
            src={responsive.src}
            srcSet={responsive.srcSet}
            sizes={responsive.sizes}
            alt={image?.alt || p.name || "Product"}
            width={600}
            height={600}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : "auto"}
            onError={onImageSrcSetError}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground/40">
            <Gem className="h-10 w-10" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-2.5">
        {availability.kind === "supplier" && (
          <span className="inline-flex w-fit items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
            <Truck className="h-2.5 w-2.5" aria-hidden="true" /> {availability.delivery}
          </span>
        )}
        {availability.kind === "out" && (
          <span className="inline-flex w-fit items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
            Out of Stock
          </span>
        )}
        {/* Fixed two-line box. Bengali glyphs are taller than Latin, so a
            `min-h` + line-clamp box leaked a sliver of the third line; an exact
            height (2 x line-height) with overflow hidden crops cleanly. */}
        <p className="line-clamp-2 h-[34px] overflow-hidden text-[13px] font-medium leading-[17px] text-ink">
          {cardTitle(p)}
        </p>
        {(rating > 0 || soldish > 0) && (
          <p className="text-[11px] text-primary/80">
            {rating > 0 && <span className="font-semibold">{rating.toFixed(1)}★</span>}
            {rating > 0 && soldish > 0 && <span className="text-muted-foreground"> · </span>}
            {soldish > 0 && <span>{soldish}+ sold</span>}
          </p>
        )}
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-[13px] font-extrabold leading-none text-primary md:text-[15px]">
            {formatBDT(sell)}
          </span>
          {regular != null && (
            <span className="text-[10px] text-muted-foreground line-through">
              {formatBDT(regular)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
});

export function BigProductGrid({
  products,
  columns = 2,
}: {
  products: WooProduct[] | undefined;
  columns?: 2 | 3;
}) {
  const seedProduct = useSeedProductCache();
  const list = useMemo(() => (products ?? []).filter((p) => p && p.slug), [products]);
  if (!list.length) return null;
  const gridClass =
    columns === 3 ? "grid grid-cols-3 gap-1.5 px-[5px]" : "grid grid-cols-2 gap-2 px-[5px]";
  return (
    <section aria-label="Products" className="pb-6">
      <div className={gridClass} data-vr="feed-grid-live">

        {list.map((p, i) => (
          <BigCard key={p.id} p={p} priority={i < 2} columns={columns} onSeed={seedProduct} />
        ))}
      </div>
    </section>
  );
}
