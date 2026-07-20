import { Link } from "@tanstack/react-router";
import { Gem, Flame } from "lucide-react";
import { formatBDT } from "@/lib/format";
import type { WooProduct } from "@/lib/woo.server";

export function DealsStrip({ products }: { products: WooProduct[] }) {
  if (!products.length) return null;
  return (
    <section aria-label="Mega Deals" className="pb-3">
      <div className="mx-[5px] overflow-hidden rounded-2xl bg-white p-2.5 ring-1 ring-border/60 shadow-sm md:p-3">
        <div className="flex items-stretch gap-2.5">
          {/* Left banner */}
          <div className="relative flex w-[92px] shrink-0 flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary to-[#5a0405] p-2.5 text-primary-foreground shadow-sm md:w-[108px]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-amber-300/30 blur-xl"
            />
            <div className="relative">
              <div className="inline-flex items-center gap-0.5 rounded-full bg-amber-300 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                <Flame className="h-2.5 w-2.5" /> 50% OFF
              </div>
              <p className="mt-1.5 font-display text-[16px] font-extrabold leading-[1]">
                Mega
                <br />
                Sale
              </p>
              <p className="mt-1 text-[9px] font-medium leading-tight text-white/80">
                Limited time
              </p>
            </div>
            <Link
              to="/products"
              search={{ orderby: "popularity" }}
              className="relative mt-1.5 inline-block text-[10px] font-bold text-amber-300 underline underline-offset-2"
            >
              Shop all →
            </Link>
          </div>

          {/* Horizontal product scroll */}
          <div className="scroll-snap-x -mr-2.5 flex min-w-0 flex-1 gap-2 overflow-x-auto pr-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:-mr-3 md:pr-3">
            {products.slice(0, 12).map((p) => {
              const price = p.on_sale && p.sale_price ? p.sale_price : p.price;
              return (
                <Link
                  key={p.id}
                  to="/products/$slug"
                  params={{ slug: p.slug }}
                  preload="intent"
                  className="flex w-[84px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border bg-white transition-all hover:border-primary/40 hover:shadow-md md:w-[96px]"
                >
                  <div className="relative h-[84px] w-[84px] shrink-0 overflow-hidden bg-surface-muted md:h-[96px] md:w-[96px]">
                    {p.images[0] ? (
                      <img
                        src={p.images[0].src}
                        alt={p.images[0].alt || p.name}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-muted-foreground/40">
                        <Gem className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 items-center justify-center bg-white px-1 py-2">
                    <p className="text-center text-[14px] font-extrabold leading-none text-primary">
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
