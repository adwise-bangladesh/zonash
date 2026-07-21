import { lazy, memo, Suspense, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Eye,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { getProductVariations } from "@/lib/woo.functions";
import { formatBDT } from "@/lib/format";
import { parsePriceHtmlMin } from "@/lib/price-range";
import { buildResponsiveImage } from "@/lib/product-image";
import { pickDefaultVariation } from "@/lib/pick-default-variation";
import type { CartItem } from "@/lib/cart";
import { useCart } from "@/lib/cart";
import type { WooProduct, WooVariation } from "@/lib/woo.server";

// Lazy — Lightbox is only loaded when the user taps the eye button.
const Lightbox = lazy(() =>
  import("./Lightbox").then((m) => ({ default: m.Lightbox })),
);

// Long stale window for variation data — variations rarely change, and
// keeping them fresh across the whole session (plus 24h in localStorage)
// means revisits render instantly with zero API calls.
export const VARIATIONS_STALE_MS = 24 * 60 * 60 * 1000;

type CardState = "idle" | "loading" | "added";

function QuickCardImpl({
  p,
  cartLine,
}: {
  p: WooProduct;
  cartLine: CartItem | undefined;
}) {
  const { add, setQty, remove } = useCart();
  const qc = useQueryClient();
  const [state, setState] = useState<CardState>("idle");
  const [lightbox, setLightbox] = useState(false);

  const isVariable = p.type === "variable" && (p.variations?.length ?? 0) > 0;

  const variationsQuery = useQuery({
    queryKey: ["product-variations", p.id],
    queryFn: () => getProductVariations({ data: { productId: p.id } }),
    enabled: isVariable,
    staleTime: VARIATIONS_STALE_MS,
    gcTime: 24 * 60 * 60 * 1000,
  });

  const variationsPending = isVariable && !variationsQuery.isSuccess;

  const defaultVariation = useMemo(
    () =>
      isVariable
        ? pickDefaultVariation(
            p,
            (variationsQuery.data?.variations ?? []) as WooVariation[],
          )
        : undefined,
    [isVariable, p, variationsQuery.data],
  );

  // Prices ------------------------------------------------------------
  const { displayPrice, displayRegular } = useMemo(() => {
    if (isVariable && defaultVariation) {
      const sale = parseFloat(defaultVariation.sale_price || "0");
      const base = parseFloat(defaultVariation.price || "0");
      const regular = parseFloat(defaultVariation.regular_price || "0");
      const cur = sale > 0 ? sale : base;
      const price = Number.isFinite(cur) && cur > 0 ? cur : null;
      const reg =
        Number.isFinite(regular) && regular > (cur || 0) ? regular : null;
      return { displayPrice: price, displayRegular: reg };
    }
    if (isVariable) {
      const range = parsePriceHtmlMin(p.price_html);
      return {
        displayPrice: range.sale ?? range.regular,
        displayRegular: range.regular && range.sale ? range.regular : null,
      };
    }
    const sale = p.on_sale && p.sale_price ? parseFloat(p.sale_price) : NaN;
    const reg = parseFloat(p.regular_price || p.price || "0");
    const cur = !Number.isNaN(sale) ? sale : parseFloat(p.price || "0");
    return {
      displayPrice: Number.isFinite(cur) && cur > 0 ? cur : null,
      displayRegular:
        p.on_sale && Number.isFinite(reg) && reg > (cur || 0) ? reg : null,
    };
  }, [isVariable, defaultVariation, p]);

  const cardImage =
    (isVariable && defaultVariation?.image?.src) || p.images[0]?.src;
  const cardImageAlt =
    (isVariable && defaultVariation?.image?.alt) || p.images[0]?.alt || p.name;
  const cardImageKey = cardImage ?? "empty";

  const responsive = useMemo(
    () =>
      buildResponsiveImage(cardImage, {
        sizes: "(min-width: 768px) 120px, 25vw",
      }),
    [cardImage],
  );

  const trackedId = isVariable ? (defaultVariation?.id ?? -1) : p.id;
  const inCart = !!cartLine;

  // Availability ----------------------------------------------------
  const productSoldOut = p.stock_status !== "instock" && !p.backorders_allowed;
  const productNotPurchasable =
    (p as { purchasable?: boolean }).purchasable === false;
  const variationsLoaded = isVariable && variationsQuery.isSuccess;
  const variableUnavailable =
    variationsLoaded &&
    (!defaultVariation ||
      (defaultVariation.stock_status !== "instock" &&
        !(defaultVariation as { backorders_allowed?: boolean })
          .backorders_allowed) ||
      (defaultVariation as { purchasable?: boolean }).purchasable === false ||
      !(
        parseFloat(defaultVariation.price || "0") > 0 ||
        parseFloat(defaultVariation.sale_price || "0") > 0
      ));

  const unavailable =
    productSoldOut || productNotPurchasable || variableUnavailable;

  async function handleAdd() {
    if (state === "loading" || unavailable) return;
    try {
      if (!isVariable) {
        const price =
          p.on_sale && p.sale_price
            ? parseFloat(p.sale_price)
            : parseFloat(p.price || "0");
        const regular = parseFloat(p.regular_price || "0");
        add({
          productId: p.id,
          name: p.name,
          slug: p.slug,
          sku: p.sku,
          price: Number.isFinite(price) && price > 0 ? price : 0,
          regularPrice:
            Number.isFinite(regular) && regular > 0 ? regular : undefined,
          image: p.images[0]?.src,
        });
      } else {
        setState("loading");
        const res = await qc.ensureQueryData({
          queryKey: ["product-variations", p.id],
          queryFn: () => getProductVariations({ data: { productId: p.id } }),
          staleTime: VARIATIONS_STALE_MS,
        });
        const variations = (res?.variations ?? []) as WooVariation[];
        const v = pickDefaultVariation(p, variations);
        if (
          !v ||
          (v.stock_status !== "instock" &&
            !(v as { backorders_allowed?: boolean }).backorders_allowed) ||
          (v as { purchasable?: boolean }).purchasable === false
        ) {
          setState("idle");
          return;
        }
        const salePrice = parseFloat(v.sale_price || "0");
        const price = salePrice > 0 ? salePrice : parseFloat(v.price || "0");
        const regular = parseFloat(v.regular_price || "0");
        add({
          productId: v.id,
          name: p.name,
          slug: p.slug,
          sku: v.sku || p.sku,
          price: Number.isFinite(price) && price > 0 ? price : 0,
          regularPrice:
            Number.isFinite(regular) && regular > (price || 0)
              ? regular
              : undefined,
          image: v.image?.src || p.images[0]?.src,
        });
      }
      setState("added");
      setTimeout(() => setState("idle"), 1100);
    } catch {
      setState("idle");
    }
  }

  const unavailableLabel = productSoldOut ? "Sold out" : "Unavailable";

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-lg bg-white text-left shadow-sm ring-1 ring-border/60 transition-all duration-200 ${
        unavailable ? "opacity-95" : ""
      }`}
    >
      <div className="relative aspect-square overflow-hidden bg-surface-muted">
        {cardImage && responsive ? (
          <picture>
            <source type="image/webp" srcSet={responsive.srcSetWebp} sizes={responsive.sizes} />
            <img
              key={cardImageKey}
              src={responsive.src}
              srcSet={responsive.srcSet}
              sizes={responsive.sizes}
              alt={cardImageAlt}
              loading="lazy"
              decoding="async"
              className={`h-full w-full animate-fade-in object-cover transition-transform duration-300 ${
                unavailable
                  ? "scale-100 opacity-60 grayscale-[0.4]"
                  : "group-hover:scale-105"
              }`}
            />
          </picture>
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground/40">
            <ShoppingBag className="h-5 w-5" />
          </div>
        )}

        {variationsPending && !unavailable && (
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-br from-white/50 via-white/10 to-transparent" />
        )}

        {/* Primary add-to-cart hit target — full-size button under
            overlay controls, keyboard/screen-reader accessible. */}
        <button
          type="button"
          onClick={handleAdd}
          disabled={unavailable || state === "loading"}
          aria-label={
            unavailable
              ? `${p.name} — ${unavailableLabel}`
              : `Add ${p.name} to cart`
          }
          className={`absolute inset-0 z-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60 ${
            unavailable
              ? "cursor-not-allowed"
              : "cursor-pointer active:scale-[0.97]"
          }`}
        />

        {state === "loading" && (
          <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center bg-black/40">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        )}
        {state === "added" && (
          <div className="pointer-events-none absolute inset-0 z-[5] grid animate-fade-in place-items-center bg-primary/85">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white shadow-md">
              <Check className="h-5 w-5 text-primary" strokeWidth={3} />
            </span>
          </div>
        )}

        {state === "idle" && (
          <button
            type="button"
            aria-label={`Preview ${p.name} images`}
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(true);
            }}
            className="absolute left-1 top-1 z-10 grid h-6 w-6 place-items-center rounded-full text-white transition-transform hover:scale-110 active:scale-95 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.55))]"
          >
            <Eye className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )}

        {state === "idle" && inCart && cartLine && !unavailable && (
          <div
            role="group"
            aria-label={`Quantity — ${cartLine.quantity} in cart`}
            className="absolute inset-x-1 bottom-1 z-10 flex animate-fade-in items-center justify-between gap-1 rounded-full bg-primary/95 px-1 py-1 text-primary-foreground shadow-lg ring-1 ring-primary/30 backdrop-blur"
          >
            <button
              type="button"
              aria-label={
                cartLine.quantity <= 1 ? "Remove from cart" : "Decrease quantity"
              }
              onClick={(e) => {
                e.stopPropagation();
                if (cartLine.quantity <= 1) remove(trackedId);
                else setQty(trackedId, cartLine.quantity - 1);
              }}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 active:scale-90"
            >
              {cartLine.quantity <= 1 ? (
                <Trash2 className="h-3 w-3" strokeWidth={2.5} />
              ) : (
                <Minus className="h-3 w-3" strokeWidth={3} />
              )}
            </button>
            <span
              className="min-w-[16px] text-center text-[11px] font-extrabold leading-none tabular-nums"
              aria-live="polite"
              aria-atomic="true"
            >
              {cartLine.quantity}
            </span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={(e) => {
                e.stopPropagation();
                setQty(trackedId, cartLine.quantity + 1);
              }}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 active:scale-90"
            >
              <Plus className="h-3 w-3" strokeWidth={3} />
            </button>
          </div>
        )}

        {unavailable && (
          <>
            <span className="pointer-events-none absolute inset-0 z-[5] grid place-items-center">
              <span className="rotate-[-8deg] rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-lg ring-1 ring-white/10">
                {unavailableLabel}
              </span>
            </span>
            <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] bg-black/70 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wider text-white">
              {unavailableLabel}
            </span>
          </>
        )}
      </div>

      <div className="flex items-baseline justify-center gap-1 px-1 py-1.5">
        {variationsPending ? (
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className="block h-2.5 w-10 animate-pulse rounded-sm bg-muted-foreground/20" />
            <span className="block h-2 w-6 animate-pulse rounded-sm bg-muted-foreground/10" />
          </span>
        ) : displayPrice != null ? (
          <span className="flex animate-fade-in items-baseline gap-1">
            <span
              className={`text-[11px] font-extrabold leading-none ${
                unavailable
                  ? "text-muted-foreground line-through"
                  : "text-primary"
              }`}
            >
              {formatBDT(displayPrice)}
            </span>
            {displayRegular != null && (
              <span className="text-[9px] leading-none text-muted-foreground line-through">
                {formatBDT(displayRegular)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </div>

      {lightbox && (
        <Suspense fallback={null}>
          <Lightbox
            title={p.name}
            images={
              p.images.length > 0
                ? p.images
                : cardImage
                  ? [{ src: cardImage, alt: cardImageAlt }]
                  : []
            }
            onClose={() => setLightbox(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

export const QuickCard = memo(QuickCardImpl);
