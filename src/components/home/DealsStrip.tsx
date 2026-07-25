import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Gem } from "lucide-react";
import { formatBDT } from "@/lib/format";
import { resolveCardPrices } from "@/lib/price-range";
import { buildResponsiveImage, onImageSrcSetError } from "@/lib/product-image";

import { useSeedProductCache } from "@/lib/seed-product-cache";
import type { WooProduct } from "@/lib/woo.server";

const WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours

function useResetCountdown() {
  // Stable placeholder for SSR / first client render so hydration matches.
  // Real clock starts after mount, and pauses while the tab is hidden.
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const tick = () => setRemaining(WINDOW_MS - (Date.now() % WINDOW_MS));

    const start = () => {
      tick();
      if (id === undefined) id = setInterval(tick, 1000);
    };
    const stop = () => {
      if (id !== undefined) {
        clearInterval(id);
        id = undefined;
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (remaining == null) return "--:--:--";
  const totalSec = Math.max(0, Math.floor(remaining / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Timer is isolated in its own component so its 1 Hz state update re-renders
 * ~30 DOM nodes instead of the whole strip (banner + 12 product cards + 12
 * images), which is 60x less reconciliation work per second per open tab.
 */
function DealTimer() {
  const timer = useResetCountdown();
  return (
    <p
      role="timer"
      aria-live="off"
      aria-label={`Offer resets in ${timer}`}
      className="mt-0.5 rounded-sm bg-white/15 px-1 py-[1px] font-mono text-[9px] font-bold tabular-nums leading-none text-white md:text-[10px]"
    >
      {timer}
    </p>
  );
}

const DealCard = memo(function DealCard({
  p,
  idx,
  onSeed,
}: {
  p: WooProduct;
  idx: number;
  onSeed: (p: WooProduct) => void;
}) {
  const { sell } = resolveCardPrices(p);
  const image = p.images?.[0];
  const seed = () => onSeed(p);
  // 58–84px thumbnails were previously served as the full-size
  // WordPress original — up to 12 of them on first paint.
  const responsive = buildResponsiveImage(image?.src, {
    sizes: "(min-width: 768px) 84px, 58px",
  });
  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      preload="intent"
      aria-label={p.name}
      onPointerDown={(e) => {
        if (e.button === 0) seed();
      }}
      onFocus={seed}
      className="flex w-[58px] shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-border bg-white transition-all hover:border-primary/40 hover:shadow-md md:w-[84px]"
    >
      <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-surface-muted">
        {responsive ? (
          <img
            src={responsive.src}
            srcSet={responsive.srcSet}
            sizes={responsive.sizes}
            alt={image?.alt || p.name || "Product"}
            width={168}
            height={168}
            loading={idx < 4 ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={idx === 0 ? "high" : "auto"}
            onError={onImageSrcSetError}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground/40">
            <Gem className="h-4 w-4" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center bg-white px-1 py-1.5">
        <p className="text-center text-[11px] font-extrabold leading-none text-primary md:text-[13px]">
          {formatBDT(sell)}
        </p>
      </div>
    </Link>
  );
});

export function DealsStrip({ products }: { products: WooProduct[] | undefined }) {
  const seedProduct = useSeedProductCache();
  const list = useMemo(
    () => (products ?? []).filter((p) => p && p.slug).slice(0, 12),
    [products],
  );
  if (!list.length) return null;

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
              aria-label="Shop the Mega Sale"
              className="relative flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5"
            >
              <p className="text-center font-display font-black uppercase leading-[0.95] tracking-tight text-white text-[13px] md:text-[16px]">
                Mega
              </p>
              <p className="text-center font-display font-semibold italic leading-none tracking-wide text-white/85 text-[9px] md:text-[11px]">
                Sale
              </p>
              <DealTimer />
            </Link>
          </div>

          {/* Horizontal product scroll */}
          <div className="scroll-snap-x -mr-2.5 flex min-w-0 flex-1 gap-2 overflow-x-auto pr-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:-mr-3 md:pr-3">
            {list.map((p, idx) => (
              <DealCard key={p.id} p={p} idx={idx} onSeed={seedProduct} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

