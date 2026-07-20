import { Link } from "@tanstack/react-router";
import { Gem } from "lucide-react";
import { formatBDT } from "@/lib/format";
import type { WooProduct } from "@/lib/woo.server";

export function DealsStrip({ products }: { products: WooProduct[] }) {
  if (!products.length) return null;
  return (
    <section aria-label="Big Deals" className="bg-background pb-3">
      <div className="mx-3 overflow-hidden rounded-2xl bg-gradient-to-r from-[#fff2f2] via-[#ffe6e6] to-[#ffd7d7] p-2.5 md:container-page md:p-3">
        <div className="flex items-stretch gap-2">
          {/* Left banner */}
          <div className="flex w-[92px] shrink-0 flex-col justify-between rounded-xl bg-white/60 p-2 text-primary shadow-sm md:w-[120px]">
            <div>
              <div className="inline-flex items-center rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                50% OFF
              </div>
              <p className="mt-2 font-display text-base font-extrabold leading-tight md:text-lg">
                Mega
                <br />
                Deals
              </p>
            </div>
            <Link to="/products" search={{ orderby: "popularity" }} className="mt-2 text-[10px] font-semibold underline">
              Shop all →
            </Link>
          </div>

          {/* Horizontal product scroll */}
          <div className="scroll-snap-x flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {products.slice(0, 10).map((p) => {
              const price = p.on_sale && p.sale_price ? p.sale_price : p.price;
              return (
                <Link
                  key={p.id}
                  to="/products/$slug"
                  params={{ slug: p.slug }}
                  preload="intent"
                  className="flex w-[92px] shrink-0 snap-start flex-col overflow-hidden rounded-xl bg-white shadow-sm md:w-[110px]"
                >
                  <div className="aspect-square bg-surface-muted">
                    {p.images[0] ? (
                      <img
                        src={p.images[0].src}
                        alt={p.images[0].alt || p.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-muted-foreground/40">
                        <Gem className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="px-1.5 py-1.5">
                    <p className="text-[13px] font-extrabold leading-none text-primary">{formatBDT(price)}</p>
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
