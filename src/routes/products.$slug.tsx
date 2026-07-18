import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Minus,
  Plus,
  Share2,
  Shield,
  ShoppingBag,
  Star,
  Truck,
  Undo2,
  Gem,
  PackageX,
} from "lucide-react";
import { getProductBySlug } from "@/lib/woo.functions";
import { useCart } from "@/lib/cart";
import { formatBDT, formatCount } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";

const productQuery = (slug: string) =>
  queryOptions({
    queryKey: ["product", slug],
    queryFn: () => getProductBySlug({ data: { slug } }),
  });

export const Route = createFileRoute("/products/$slug")({
  loader: async ({ context, params }) => {
    const res = await context.queryClient.ensureQueryData(productQuery(params.slug));
    if (!res.product) throw notFound();
    return { id: params.slug };
  },
  head: ({ match }) => {
    const detail = match.context?.queryClient.getQueryData(productQuery(match.params.slug).queryKey) as
      | { product: { name: string; short_description?: string; images: { src: string }[]; price: string } | null }
      | undefined;
    const p = detail?.product;
    if (!p) return { meta: [{ title: "Product — Zonash" }] };
    const img = p.images?.[0]?.src;
    const desc = (p.short_description ?? "").replace(/<[^>]+>/g, "").slice(0, 155) || `Buy ${p.name} at Zonash.`;
    return {
      meta: [
        { title: `${p.name} — ${p.price} Tk` },
        { name: "description", content: desc },
        { property: "og:type", content: "product" },
        { property: "og:title", content: p.name },
        { property: "og:description", content: desc },
        ...(img ? [{ property: "og:image", content: img } as const] : []),
        { name: "twitter:card", content: "summary_large_image" },
        ...(img ? [{ name: "twitter:image", content: img } as const] : []),
      ],
    };
  },
  component: ProductPage,
  notFoundComponent: () => (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <EmptyState
        icon={PackageX}
        title="Product not found"
        description="This piece may have been removed or the link is incorrect."
        primary={{ label: "Back to home", to: "/" }}
        secondary={{ label: "Browse categories", to: "/categories" }}
      />
    </div>
  ),
});

function ProductPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(productQuery(slug));
  const p = data.product!;
  const gallery = p.images.map((i) => i.src);
  const { add, count: cartCount } = useCart();
  const navigate = useNavigate();

  const priceNum = parseFloat(p.sale_price && p.on_sale ? p.sale_price : p.price) || 0;
  const oldPrice = p.on_sale && p.regular_price ? parseFloat(p.regular_price) : 0;
  const discount = oldPrice > priceNum ? Math.round(((oldPrice - priceNum) / oldPrice) * 100) : 0;
  const rating = parseFloat(p.average_rating) || 0;
  const reviews = p.rating_count ?? 0;
  const inStock = p.stock_status === "instock";

  const shortDesc = useMemo(() => (p.short_description ?? "").replace(/<[^>]+>/g, "").trim(), [p.short_description]);

  const [qty, setQty] = useState(1);
  const galleryRef = useRef<HTMLDivElement>(null);
  const [activeImg, setActiveImg] = useState(0);
  const onGalleryScroll = () => {
    const el = galleryRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== activeImg) setActiveImg(i);
  };
  const scrollToImg = (i: number) => {
    const el = galleryRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setActiveImg(i);
  };
  const [descOpen, setDescOpen] = useState(false);

  const addLine = () => {
    add({ productId: p.id, name: p.name, slug: p.slug, price: priceNum, image: gallery[0] }, qty);
  };
  const handleAdd = () => {
    addLine();
    toast.success("Added to cart");
  };
  const handleBuyNow = () => {
    addLine();
    navigate({ to: "/checkout" });
  };
  const handleShare = async () => {
    try {
      if (navigator.share) await navigator.share({ title: p.name, url: window.location.href });
      else await navigator.clipboard.writeText(window.location.href);
    } catch { /* ignore */ }
  };

  return (
    <div className="min-h-[100dvh] bg-muted/30 pb-24">
      {/* Sticky top bar */}
      <header className="sticky top-0 z-30 flex h-11 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur md:h-14 md:px-6">
        <button
          type="button"
          onClick={() => (typeof window !== "undefined" && window.history.length > 1 ? window.history.back() : navigate({ to: "/" }))}
          aria-label="Back"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold md:text-base">{p.name}</span>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" aria-label="Share" onClick={handleShare} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted">
            <Share2 className="h-5 w-5" />
          </button>
          <Link to="/cart" aria-label="Cart" className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-muted">
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-md md:max-w-6xl md:px-4 md:py-6">
        <div className="grid md:grid-cols-[minmax(0,1fr)_360px] md:gap-8">
          {/* Gallery */}
          <div>
            <div className="relative bg-background">
              <div
                ref={galleryRef}
                onScroll={onGalleryScroll}
                className="flex aspect-square w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {(gallery.length ? gallery : [""]).map((src, i) => (
                  <div key={i} className="relative aspect-square w-full shrink-0 snap-center">
                    {src ? (
                      <img src={src} alt={p.name} className="h-full w-full object-cover" loading={i === 0 ? "eager" : "lazy"} />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-muted"><Gem className="h-16 w-16 text-muted-foreground/40" /></div>
                    )}
                  </div>
                ))}
              </div>
              {discount > 0 && (
                <span className="absolute left-3 top-3 rounded-[3px] bg-primary px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                  -{discount}%
                </span>
              )}
              {gallery.length > 1 && (
                <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1">
                  {gallery.map((_, i) => (
                    <span key={i} className={`h-1.5 rounded-full transition-all ${i === activeImg ? "w-4 bg-primary" : "w-1.5 bg-background/70"}`} />
                  ))}
                </div>
              )}
            </div>
            {gallery.length > 1 && (
              <div className="grid grid-cols-6 gap-1 border-y border-border bg-background p-1 md:hidden">
                {gallery.slice(0, 6).map((src, i) => (
                  <button
                    key={i}
                    onClick={() => scrollToImg(i)}
                    className={`aspect-square overflow-hidden rounded-[3px] ${i === activeImg ? "ring-2 ring-primary" : "opacity-70"}`}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
            {gallery.length > 1 && (
              <div className="mt-3 hidden grid-cols-6 gap-2 md:grid">
                {gallery.slice(0, 6).map((src, i) => (
                  <button
                    key={i}
                    onClick={() => scrollToImg(i)}
                    className={`aspect-square overflow-hidden rounded-[3px] ${i === activeImg ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"}`}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="bg-background md:rounded-[3px] md:border md:border-border md:p-5">
            {/* Price block */}
            <div className="border-b border-border p-3 md:border-none md:p-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-2xl font-extrabold text-primary md:text-3xl">{formatBDT(priceNum)}</span>
                {oldPrice > priceNum && (
                  <span className="text-sm text-muted-foreground line-through">{formatBDT(oldPrice)}</span>
                )}
                {discount > 0 && (
                  <span className="rounded-[3px] bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">-{discount}%</span>
                )}
              </div>
              <h1 className="mt-2 text-[15px] font-semibold leading-snug md:text-xl">{p.name}</h1>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                {reviews > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                    <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
                    <span>({formatCount(reviews)})</span>
                  </span>
                )}
                {reviews > 0 && <span>{formatCount(reviews)} sold</span>}
                <span className={`ml-auto rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase ${inStock ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                  {inStock ? "In stock" : "Sold out"}
                </span>
              </div>
            </div>

            {/* Categories chip row */}
            {p.categories && p.categories.length > 0 && (
              <div className="border-b border-border p-3 md:border-none md:px-0 md:pt-4">
                <div className="flex flex-wrap gap-1.5">
                  {p.categories.map((c) => (
                    <Link
                      key={c.id}
                      to="/categories"
                      search={{ parent: c.slug } as never}
                      className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[11px] text-foreground hover:border-primary hover:text-primary"
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Delivery + guarantees */}
            <div className="grid grid-cols-3 gap-2 border-b border-border p-3 text-center md:border-none md:px-0 md:pt-4">
              <div className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground">
                <Truck className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">Fast delivery</span>
                <span>1-3 days</span>
              </div>
              <div className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground">
                <Undo2 className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">Easy returns</span>
                <span>7-day</span>
              </div>
              <div className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground">
                <Shield className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">Guarantee</span>
                <span>Authentic</span>
              </div>
            </div>

            {/* Quantity + inline add for desktop */}
            <div className="hidden items-center justify-between border-b border-border p-3 md:flex md:border-none md:px-0 md:pt-5">
              <span className="text-sm font-semibold">Quantity</span>
              <div className="flex items-center rounded-[3px] bg-secondary shadow-[var(--shadow-soft)]">
                <button aria-label="Decrease" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-9 w-9 place-items-center text-muted-foreground active:scale-95">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-9 text-center text-sm font-semibold">{qty}</span>
                <button aria-label="Increase" onClick={() => setQty((q) => Math.min(99, q + 1))} className="grid h-9 w-9 place-items-center text-primary active:scale-95">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Desktop CTAs */}
            <div className="mt-3 hidden gap-2 md:flex">
              <button
                type="button"
                onClick={handleAdd}
                disabled={!inStock}
                className="h-11 flex-1 rounded-[3px] border border-primary bg-background text-sm font-bold uppercase tracking-wide text-primary disabled:opacity-40"
              >
                Add to cart
              </button>
              <button
                type="button"
                onClick={handleBuyNow}
                disabled={!inStock}
                className="h-11 flex-1 rounded-[3px] bg-primary text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-40"
              >
                Buy now
              </button>
            </div>
          </div>
        </div>

        {/* Description */}
        {(shortDesc || p.description) && (
          <details
            open={descOpen}
            onToggle={(e) => setDescOpen((e.target as HTMLDetailsElement).open)}
            className="mt-3 rounded-[3px] border border-border bg-background md:mt-6"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between p-3 md:p-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${descOpen ? "rotate-180" : ""}`} />
            </summary>
            <div className="border-t border-dashed border-border px-3 pb-4 pt-3 text-[13px] leading-relaxed text-foreground md:px-4">
              {shortDesc && <p className="mb-3">{shortDesc}</p>}
              {p.description && (
                <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: p.description }} />
              )}
            </div>
          </details>
        )}
      </div>

      {/* Mobile sticky action bar */}
      <div
        className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex items-center rounded-[3px] bg-secondary shadow-[var(--shadow-soft)]">
            <button aria-label="Decrease" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-10 w-9 place-items-center text-muted-foreground active:scale-95">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-8 text-center text-sm font-semibold">{qty}</span>
            <button aria-label="Increase" onClick={() => setQty((q) => Math.min(99, q + 1))} className="grid h-10 w-9 place-items-center text-primary active:scale-95">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!inStock}
            className="h-10 flex-1 rounded-[3px] border border-primary bg-background text-[13px] font-bold uppercase tracking-wide text-primary disabled:opacity-40"
          >
            Add to cart
          </button>
          <button
            type="button"
            onClick={handleBuyNow}
            disabled={!inStock}
            className="h-10 flex-1 rounded-[3px] bg-primary text-[13px] font-bold uppercase tracking-wide text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-40"
          >
            Buy now
          </button>
        </div>
      </div>
    </div>
  );
}
