import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Gem, Flame } from "lucide-react";
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
          <div className="relative w-[58px] shrink-0 overflow-hidden rounded-lg shadow-sm ring-1 ring-white/20 md:w-[84px]">
            <div aria-hidden="true" className="mega-aurora absolute inset-0" />
            <div aria-hidden="true" className="mega-shine absolute inset-0 overflow-hidden" />
            <span
              aria-hidden="true"
              className="mega-spark absolute left-1.5 top-1.5 h-1 w-1 rounded-full bg-white/80"
            />
            <span
              aria-hidden="true"
              className="mega-spark absolute right-2 top-3 h-[3px] w-[3px] rounded-full bg-amber-200"
              style={{ animationDelay: "0.6s" }}
            />
            <span
              aria-hidden="true"
              className="mega-spark absolute bottom-3 left-3 h-[2px] w-[2px] rounded-full bg-white"
              style={{ animationDelay: "1.1s" }}
            />
            <Link
              to="/products"
              search={{ orderby: "popularity" }}
              className="relative flex h-full min-h-[104px] flex-col items-center justify-center gap-1 px-1 py-2 md:min-h-[140px]"
            >
              <Flame className="flame-flicker h-4 w-4 text-amber-200 md:h-5 md:w-5" />
              <p className="text-center font-display text-[11px] font-black uppercase tracking-[0.14em] leading-[1.05] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.35)] md:text-[13px]">
                Mega
                <br />
                Sale
              </p>
              <p className="rounded-sm bg-black/25 px-1.5 py-[2px] font-mono text-[9px] font-bold tabular-nums leading-none text-white ring-1 ring-white/20 backdrop-blur-[2px] md:text-[10px]">
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
