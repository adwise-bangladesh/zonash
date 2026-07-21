import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Star, Gem } from "lucide-react";
import { formatBDT } from "@/lib/format";
import { getProductVariations } from "@/lib/woo.functions";
import type { WooProduct } from "@/lib/woo.server";

export function ProductCard({ p }: { p: WooProduct }) {
  const price = p.sale_price && p.on_sale ? p.sale_price : p.price;
  const rating = parseFloat(p.average_rating as unknown as string);
  const queryClient = useQueryClient();
  const seedProductCache = () => {
    queryClient.setQueryData(["product", p.slug], { product: p, error: null as string | null });
    // Warm variations in the background so the detail page renders instantly
    // even for variable products. wooFetch dedupes + edge-caches this call.
    if (p.type === "variable" && (p.variations?.length ?? 0) > 0) {
      void queryClient.prefetchQuery({
        queryKey: ["product-variations", p.id],
        queryFn: () => getProductVariations({ data: { productId: p.id } }),
        staleTime: 5 * 60 * 1000,
      });
    }
  };
  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      preload="intent"
      onPointerDown={(e) => {
        if (e.button === 0) seedProductCache();
      }}
      onFocus={seedProductCache}
      className="group flex flex-col overflow-hidden bg-background transition-transform active:scale-[0.99]"
    >
      <div className="relative aspect-square overflow-hidden bg-surface-muted">
        {p.images[0] ? (
          <img
            src={p.images[0].src}
            alt={p.images[0].alt || p.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <Gem className="h-10 w-10" />
          </div>
        )}
        {p.on_sale && (
          <span className="absolute left-2 top-2 rounded-[3px] bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
            Sale
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5 sm:p-3">
        <p className="line-clamp-2 min-h-[2.4rem] text-[12px] font-medium leading-snug text-foreground sm:text-sm">
          {p.name}
        </p>
        <div className="mt-auto flex items-baseline gap-2">
          <span className="text-sm font-bold text-ink sm:text-base">{formatBDT(price)}</span>
          {p.on_sale && p.regular_price && (
            <span className="text-[11px] text-muted-foreground line-through sm:text-xs">
              {formatBDT(p.regular_price)}
            </span>
          )}
        </div>
        {!Number.isNaN(rating) && rating > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground sm:text-xs">
            <Star className="h-3 w-3 fill-warning text-warning" aria-hidden="true" />
            <span className="font-medium text-foreground">{rating.toFixed(1)}</span>
            {p.rating_count > 0 && (
              <span className="text-muted-foreground/70">({p.rating_count})</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
