import { Link } from "@tanstack/react-router";
import { Gem, Flame } from "lucide-react";
import { formatBDT } from "@/lib/format";
import type { WooProduct } from "@/lib/woo.server";

export function DealsStrip({ products }: { products: WooProduct[] }) {
  if (!products.length) return null;
  return (
    <section aria-label="Mega Deals" className="bg-background pb-3">
      <div className="mx-3 overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-[#5a0405] p-2.5 shadow-md md:container-page md:p-3">
        <div className="flex items-stretch gap-2">
          {/* Left banner */}
          <div className="relative flex w-[86px] shrink-0 flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-b from-amber-300 via-amber-200 to-amber-100 p-2 text-primary shadow-sm md:w-[104px]">
            <div>
              <div className="inline-flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground">
                <Flame className="h-2.5 w-2.5" /> 50% OFF
              </div>
              <p className="mt-1.5 font-display text-[15px] font-extrabold leading-[1] md:text-base">
                Mega
                <br />
                Deals
              </p>
            </div>
            <Link
              to="/products"
              search={{ orderby: "popularity" }}
              className="mt-1.5 inline-block text-[10px] font-bold text-primary underline underline-offset-2"
            >
              Shop all →
            </Link>
          </div>

          {/* Horizontal product scroll */}
          <div className="scroll-snap-x flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {products.slice(0, 12).map((p) => {
              const price = p.on_sale && p.sale_price ? p.sale_price : p.price;
              return (
                <Link
                  key={p.id}
                  to="/products/$slug"
                  params={{ slug: p.slug }}
                  preload="intent"
                  className="flex w-[76px] shrink-0 snap-start flex-col overflow-hidden rounded-lg bg-white shadow-sm md:w-[88px]"
                >
                  <div className="aspect-square w-full bg-surface-muted">
                    {p.images[0] ? (
                      <img
                        src={p.images[0].src}
                        alt={p.images[0].alt || p.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-muted-foreground/40">
                        <Gem className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-center px-1 py-1.5">
                    <p className="text-center text-[12px] font-extrabold leading-none text-primary">
                      {formatBDT(price)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
