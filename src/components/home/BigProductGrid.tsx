import { Link } from "@tanstack/react-router";
import { Gem, Truck } from "lucide-react";
import { formatBDT } from "@/lib/format";
import type { WooProduct } from "@/lib/woo.server";

function BigCard({ p }: { p: WooProduct }) {
  const price = p.on_sale && p.sale_price ? p.sale_price : p.price;
  const rating = parseFloat(p.average_rating as unknown as string);
  const soldish = p.rating_count ?? 0;
  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      preload="intent"
      className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-border/60 transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden bg-surface-muted">
        {p.images[0] ? (
          <img
            src={p.images[0].src}
            alt={p.images[0].alt || p.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground/40">
            <Gem className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-2.5">
        <div className="flex flex-wrap items-center gap-1">
          {p.stock_status !== "instock" && p.backorders_allowed && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
              <Truck className="h-2.5 w-2.5" /> Slower delivery
            </span>
          )}
        </div>
        <p className="line-clamp-2 min-h-[2.4rem] text-[13px] font-medium leading-snug text-ink">
          {p.name}
        </p>
        {(rating > 0 || soldish > 0) && (
          <p className="text-[11px] text-primary/80">
            {rating > 0 && <span className="font-semibold">{rating.toFixed(1)}★</span>}
            {rating > 0 && soldish > 0 && <span className="text-muted-foreground"> · </span>}
            {soldish > 0 && <span>{soldish}+ sold</span>}
          </p>
        )}
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-[13px] font-extrabold leading-none text-primary md:text-[15px]">{formatBDT(price)}</span>
          {p.on_sale && p.regular_price && (
            <span className="text-[10px] text-muted-foreground line-through">
              {formatBDT(p.regular_price)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function BigProductGrid({ products, title }: { products: WooProduct[]; title?: string }) {
  if (!products.length) return null;
  return (
    <section aria-label={title || "For you"} className="pb-6">
      {title && (
        <div className="container-page mb-3 flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-primary" />
          <h2 className="font-display text-lg font-bold text-ink md:text-xl">{title}</h2>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 px-[5px] md:grid-cols-3 md:gap-3 lg:grid-cols-4">
        {products.map((p) => (
          <BigCard key={p.id} p={p} />
        ))}
      </div>
    </section>
  );
}
