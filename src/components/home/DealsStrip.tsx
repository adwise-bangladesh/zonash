import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Gem } from "lucide-react";
import { formatBDT } from "@/lib/format";
import type { WooProduct } from "@/lib/woo.server";

const WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours

function useResetCountdown() {
  const [remaining, setRemaining] = useState(() => {
    const now = Date.now();
    return WINDOW_MS - (now % WINDOW_MS);
  });
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setRemaining(WINDOW_MS - (now % WINDOW_MS));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const totalSec = Math.max(0, Math.floor(remaining / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function DealsStrip({ products }: { products: WooProduct[] }) {
  const timer = useResetCountdown();
  if (!products.length) return null;
  return (
    <section aria-label="Mega Deals" className="pb-3">
      <div className="mx-[5px] overflow-hidden rounded-2xl bg-white p-2.5 ring-1 ring-border/60 shadow-sm md:p-3">
        <div className="flex items-stretch gap-2">
          {/* Left banner — matches product card size */}
          <div className="relative flex w-[58px] shrink-0 flex-col overflow-hidden rounded-lg bg-gradient-to-br from-primary via-primary to-[#5a0405] text-white shadow-sm md:w-[84px]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-3 -top-3 h-10 w-10 rounded-full bg-amber-300/25 blur-xl"
            />
            <Link
              to="/products"
              search={{ orderby: "popularity" }}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5"
            >
              <p className="text-center font-display font-black uppercase leading-[0.95] tracking-tight text-white text-[13px] md:text-[16px]">
                Mega
              </p>
              <p className="text-center font-display font-semibold italic leading-none tracking-wide text-white/85 text-[9px] md:text-[11px]">
                Sale
              </p>
              <p className="mt-0.5 rounded-sm bg-white/15 px-1 py-[1px] font-mono text-[9px] font-bold tabular-nums leading-none text-white md:text-[10px]">
                {timer}
              </p>
            </Link>
              <p className="rounded-sm bg-white/15 px-1 py-[1px] font-mono text-[9px] font-bold tabular-nums leading-none text-white md:text-[10px]">
                {timer}
              </p>
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
                  className="flex w-[58px] shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-border bg-white transition-all hover:border-primary/40 hover:shadow-md md:w-[84px]"
                >
                  <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-surface-muted">
                    {p.images[0] ? (
                      <img
                        src={p.images[0].src}
                        alt={p.images[0].alt || p.name}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-muted-foreground/40">
                        <Gem className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 items-center justify-center bg-white px-1 py-1.5">
                    <p className="text-center text-[11px] font-extrabold leading-none text-primary md:text-[13px]">
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
