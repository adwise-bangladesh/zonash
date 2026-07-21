import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect, lazy, Suspense } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  Minus,
  Plus,
  Share2,
  ShoppingBag,
  Star,
  Gem,
  PackageX,
} from "lucide-react";
import { getProductBySlug, getProductVariations } from "@/lib/woo.functions";
import type { WooProduct, WooVariation } from "@/lib/woo.server";
import { useCart } from "@/lib/cart";
import { formatBDT } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { buildResponsiveImage } from "@/lib/product-image";

// Below-the-fold related-products feed — split out of the critical bundle so
// it doesn't compete with the hero image for main-thread time.
const InfiniteFeed = lazy(() =>
  import("@/components/home/InfiniteFeed").then((m) => ({ default: m.InfiniteFeed })),
);

const productQuery = (slug: string) =>
  queryOptions({
    queryKey: ["product", slug],
    queryFn: () => getProductBySlug({ data: { slug } }),
    staleTime: 2 * 60 * 1000,
  });

const variationsQueryOptions = (productId: number) =>
  queryOptions({
    queryKey: ["product-variations", productId],
    queryFn: () => getProductVariations({ data: { productId } }),
    staleTime: 5 * 60 * 1000,
  });

export const Route = createFileRoute("/products/$slug")({
  loader: async ({ context, params }) => {
    if (typeof document === "undefined") {
      const res = await context.queryClient.ensureQueryData(productQuery(params.slug));
      if (!res.product) throw notFound();
      // Chain-prefetch variations on the server to collapse the client
      // waterfall — wooFetch dedupes/coalesces so this is ~free on cache hits.
      const prod = res.product;
      if (prod.type === "variable" && (prod.variations?.length ?? 0) > 0) {
        void context.queryClient.prefetchQuery(variationsQueryOptions(prod.id));
      }
    } else {
      void context.queryClient.prefetchQuery(productQuery(params.slug));
    }
    return { id: params.slug };
  },
  head: ({ match }) => {
    const detail = match.context?.queryClient.getQueryData(
      productQuery(match.params.slug).queryKey,
    ) as { product: WooProduct | null } | undefined;
    const p = detail?.product;
    if (!p) return { meta: [{ title: "Product — Zonash" }] };
    const img = p.images?.[0]?.src;
    const responsive = buildResponsiveImage(img);
    const desc =
      (p.short_description ?? "").replace(/<[^>]+>/g, "").slice(0, 155) ||
      `Buy ${p.name} at Zonash.`;
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
      // Preload the hero image responsively — the browser picks the smallest
      // srcset candidate that fits the viewport × DPR before React hydrates.
      links: responsive
        ? [
            {
              rel: "preload",
              as: "image",
              href: responsive.src,
              imagesrcset: responsive.srcSet,
              imagesizes: responsive.sizes,
              fetchpriority: "high",
            } as const,
          ]
        : [],
    };
  },
  component: ProductPage,
  pendingComponent: ProductPageSkeleton,
  pendingMs: 0,
  errorComponent: ({ error, reset }) => {
    const message =
      error instanceof Error ? error.message : "Something went wrong loading this product.";
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <EmptyState
          icon={PackageX}
          title="Couldn't load product"
          description={message}
          primary={{ label: "Try again", onClick: () => reset() }}
          secondary={{ label: "Back to home", to: "/" }}
        />
      </div>
    );
  },
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

function ProductPageSkeleton() {
  return (
    <div className="min-h-[100dvh] animate-pulse bg-muted/30 pb-28">
      {/* Floating header placeholder */}
      <header className="fixed inset-x-0 top-0 z-40 mx-auto flex h-11 max-w-[480px] items-center gap-1 bg-gradient-to-b from-black/40 to-transparent px-3">
        <div className="h-9 w-9 rounded-full bg-black/25" />
        <div className="flex-1" />
        <div className="h-9 w-9 rounded-full bg-black/25" />
        <div className="h-9 w-9 rounded-full bg-black/25" />
      </header>

      <div className="mx-auto max-w-md">
        {/* Gallery */}
        <div
          className="aspect-square w-full bg-muted"
          style={{ viewTransitionName: "product-hero" }}
        />

        {/* Info hero — matches real layout: rating → title → price row */}
        <div className="bg-gradient-to-b from-primary/[0.04] via-background to-background">
          <div className="px-4 pb-5 pt-5">
            <div className="mb-2 h-3 w-24 rounded bg-muted" />
            <div className="h-5 w-4/5 rounded bg-muted" />
            <div className="mt-1.5 h-5 w-2/3 rounded bg-muted" />
            <div className="mt-3 flex items-center gap-2">
              <div className="h-7 w-24 rounded bg-muted" />
              <div className="h-4 w-14 rounded bg-muted" />
              <div className="h-4 w-12 rounded-full bg-muted" />
              <div className="ml-auto h-4 w-16 rounded-full bg-muted" />
            </div>
          </div>

          {/* Variation grid placeholder (2×2 cards) */}
          <div className="grid grid-cols-2 gap-2 px-4 pb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[74px] rounded-xl border border-border bg-white" />
            ))}
          </div>
        </div>

        {/* Collapsible section placeholders */}
        <div className="mt-2 divide-y divide-border border-y border-border bg-background">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-4">
              <span className="h-px w-6 bg-primary/40" />
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="ml-auto h-4 w-4 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>

      {/* Sticky action bar placeholder */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] border-x border-t border-border bg-background/95"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="h-10 w-24 rounded-[3px] bg-muted" />
          <div className="h-10 flex-1 rounded-[3px] bg-muted" />
          <div className="h-10 flex-1 rounded-[3px] bg-muted" />
        </div>
      </div>
    </div>
  );
}

/** Extract clean bullet lines from short_description HTML (strips tags, splits on <li>/newlines). */
function parseHighlights(html: string): string[] {
  if (!html) return [];
  // Prefer explicit <li>…</li> items when present
  const liMatches = Array.from(html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((m) => m[1]);
  const source = liMatches.length ? liMatches : html.split(/<br\s*\/?>|<\/p>|\n/i);
  const cleaned = source
    .map((s) =>
      s
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim(),
    )
    .filter((s) => s.length > 0 && s.length < 140);
  // Deduplicate while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of cleaned) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= 6) break;
  }
  return out;
}

/**
 * Small allow-strip sanitizer for WooCommerce product descriptions rendered
 * via dangerouslySetInnerHTML. Removes script/style blocks, inline event
 * handlers, and javascript:/data: URLs. Descriptions come from a trusted
 * WordPress admin, but a compromised admin account should not be able to
 * inject executable code into shoppers' browsers.
 */
function sanitizeHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /(href|src|xlink:href)\s*=\s*(["'])\s*(?:javascript|data|vbscript):[^"']*\2/gi,
      '$1="#"',
    );
}

function ProductPage() {
  const { slug } = Route.useParams();
  const { data, isPending } = useQuery(productQuery(slug));
  if (isPending) return <ProductPageSkeleton />;
  if (!data?.product) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <EmptyState
          icon={PackageX}
          title="Product not found"
          description={data?.error || "This piece may have been removed or the link is incorrect."}
          primary={{ label: "Back to home", to: "/" }}
          secondary={{ label: "Browse categories", to: "/categories" }}
        />
      </div>
    );
  }
  return <ProductDetail p={data.product} />;
}

function ProductDetail({ p }: { p: WooProduct }) {
  const gallery = p.images.map((i) => i.src);
  const { add, count: cartCount } = useCart();
  const navigate = useNavigate();

  const isVariable = p.type === "variable" && (p.variations?.length ?? 0) > 0;

  // ---------- Variations ---------- (shared queryOptions → dedupes with loader prefetch)
  const variationsQuery = useQuery({
    ...variationsQueryOptions(p.id),
    enabled: isVariable,
    retry: 1,
  });
  const variations = useMemo<WooVariation[]>(
    () => variationsQuery.data?.variations ?? [],
    [variationsQuery.data?.variations],
  );
  // Surface a soft warning once if variations fail to load — the CTA guards
  // against an incomplete selection so the user is never stuck.
  const variationsErrShownRef = useRef(false);
  useEffect(() => {
    if (!isVariable) return;
    const msg = variationsQuery.data?.error;
    if (msg && !variationsErrShownRef.current) {
      variationsErrShownRef.current = true;
      toast.error(msg);
    }
  }, [isVariable, variationsQuery.data?.error]);

  // Attribute options come from product.attributes (variation: true).
  const variationAttrs = useMemo(
    () => (p.attributes ?? []).filter((a) => a.variation && (a.options?.length ?? 0) > 0),
    [p.attributes],
  );

  // Selected option per attribute name. Seed from default_attributes.
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const d of p.default_attributes ?? []) init[d.name] = d.option;
    return init;
  });

  // Once variations load, if any attribute isn't preset, auto-pick the first
  // in-stock variation's option so pricing/CTA is coherent.
  useEffect(() => {
    if (!isVariable || variations.length === 0) return;
    const first = variations.find((v) => v.stock_status === "instock") ?? variations[0];
    setSelected((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const a of first.attributes) {
        if (!next[a.name]) {
          next[a.name] = a.option;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [isVariable, variations]);

  const matchedVariation: WooVariation | null = useMemo(() => {
    if (!isVariable || variations.length === 0) return null;
    return (
      variations.find((v) => v.attributes.every((a) => (selected[a.name] ?? "") === a.option)) ??
      null
    );
  }, [isVariable, variations, selected]);

  // Which options are valid given the currently-selected other attributes.
  function isOptionAvailable(attrName: string, option: string): boolean {
    if (!isVariable || variations.length === 0) return true;
    return variations.some((v) => {
      let matches = true;
      for (const a of v.attributes) {
        if (a.name === attrName) {
          if (a.option !== option) matches = false;
        } else if (selected[a.name] && selected[a.name] !== a.option) {
          matches = false;
        }
      }
      return matches && v.stock_status === "instock";
    });
  }

  // ---------- Pricing / stock (variation-aware) ----------
  const activePriceStr =
    matchedVariation?.price || (p.sale_price && p.on_sale ? p.sale_price : p.price);
  const activeRegularStr = matchedVariation?.regular_price || p.regular_price;
  const priceNum = parseFloat(activePriceStr) || 0;
  const oldPrice = matchedVariation
    ? parseFloat(activeRegularStr) || 0
    : p.on_sale
      ? parseFloat(activeRegularStr) || 0
      : 0;
  const showOld = oldPrice > priceNum;
  const discount = showOld ? Math.round(((oldPrice - priceNum) / oldPrice) * 100) : 0;
  const stockStatus = matchedVariation?.stock_status ?? p.stock_status;
  const inStock = stockStatus === "instock";
  const activeImage = matchedVariation?.image?.src;
  const activeSku = ((matchedVariation?.sku || p.sku || "") + "").trim();

  const highlights = useMemo(
    () => parseHighlights(p.short_description ?? ""),
    [p.short_description],
  );
  const longDesc = useMemo(() => sanitizeHtml((p.description ?? "").trim()), [p.description]);

  // ---------- UI state ----------
  const [qty, setQty] = useState(1);
  const galleryRef = useRef<HTMLDivElement>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const lastInteractRef = useRef(0);
  const scrollRafRef = useRef(0);
  const onGalleryScroll = () => {
    lastInteractRef.current = Date.now();
    if (scrollRafRef.current) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const el = galleryRef.current;
      if (!el || el.clientWidth === 0) return;
      const i = Math.round(el.scrollLeft / el.clientWidth);
      setActiveImg((prev) => (prev === i ? prev : i));
    });
  };
  useEffect(
    () => () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    },
    [],
  );
  const scrollToImg = (i: number) => {
    const el = galleryRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setActiveImg(i);
  };
  // Auto-scroll gallery to the variation's image when it changes.
  useEffect(() => {
    if (!activeImage) return;
    const idx = gallery.findIndex((s) => s === activeImage);
    if (idx >= 0 && idx !== activeImg) scrollToImg(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeImage]);

  // Auto-advance slideshow (pauses ~6s after any user interaction).
  useEffect(() => {
    if (gallery.length < 2) return;
    const id = window.setInterval(() => {
      if (Date.now() - lastInteractRef.current < 6000) return;
      if (document.hidden) return;
      const el = galleryRef.current;
      if (!el) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % gallery.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, 3500);
    return () => window.clearInterval(id);
  }, [gallery.length]);

  // IntersectionObserver-based preload+decode for offscreen gallery slides.
  // When a slide gets within 1 viewport of scrolling in, fetch + decode its
  // image off the main thread so the swipe is a no-op paint.
  useEffect(() => {
    const root = galleryRef.current;
    if (!root || gallery.length < 2) return;
    const decoded = new Set<string>();
    const decode = (src: string) => {
      if (!src || decoded.has(src)) return;
      decoded.add(src);
      const img = new Image();
      img.decoding = "async";
      const responsive = buildResponsiveImage(src);
      if (responsive) {
        img.srcset = responsive.srcSet;
        img.sizes = responsive.sizes;
        img.src = responsive.src;
      } else {
        img.src = src;
      }
      // decode() rejects on broken URLs — swallow so we don't spam console.
      img.decode?.().catch(() => {});
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const idx = Number((e.target as HTMLElement).dataset.idx ?? -1);
          if (Number.isNaN(idx) || idx < 0) continue;
          decode(gallery[idx]);
          decode(gallery[(idx + 1) % gallery.length]);
          decode(gallery[(idx - 1 + gallery.length) % gallery.length]);
        }
      },
      { root, rootMargin: "0px 100% 0px 100%", threshold: 0.01 },
    );
    const slides = root.querySelectorAll<HTMLElement>("[data-slide]");
    slides.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [gallery]);

  const addLine = () => {
    const variantSuffix = matchedVariation
      ? " — " + matchedVariation.attributes.map((a) => a.option).join(" / ")
      : "";
    const productKey = matchedVariation ? p.id * 100000 + matchedVariation.id : p.id;
    add(
      {
        productId: productKey,
        name: p.name + variantSuffix,
        slug: p.slug,
        sku: activeSku || undefined,
        price: priceNum,
        regularPrice: showOld ? oldPrice : undefined,
        image: activeImage || gallery[0],
      },
      qty,
    );
  };
  const readyToBuy =
    inStock &&
    (!isVariable || (variationAttrs.every((a) => !!selected[a.name]) && !!matchedVariation));
  const handleAdd = () => {
    if (!readyToBuy) {
      toast.error("Please select all options");
      return;
    }
    addLine();
    toast.success("Added to cart");
  };
  const handleBuyNow = () => {
    if (!readyToBuy) {
      toast.error("Please select all options");
      return;
    }
    addLine();
    navigate({ to: "/checkout" });
  };
  const handleShare = async () => {
    try {
      if (navigator.share) await navigator.share({ title: p.name, url: window.location.href });
      else await navigator.clipboard.writeText(window.location.href);
    } catch {
      /* ignore */
    }
  };

  const detailsText = useMemo(() => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const lines: string[] = [];
    lines.push(`🛍️ ${p.name}`);
    if (activeSku) lines.push(`SKU: ${activeSku}`);
    lines.push(`Price: ${formatBDT(priceNum)}`);
    if (showOld) lines.push(`Regular: ${formatBDT(oldPrice)} (Save ${discount}%)`);
    if (matchedVariation) {
      const opts = matchedVariation.attributes.map((a) => `${a.name}: ${a.option}`).join(", ");
      if (opts) lines.push(`Variation: ${opts}`);
    }
    lines.push(`Quantity: ${qty}`);
    lines.push(`Availability: ${inStock ? "In stock" : "Sold out"}`);
    if (url) lines.push(`Link: ${url}`);
    lines.push("");
    lines.push("Please confirm my order 🙏");
    return lines.join("\n");
  }, [p.name, activeSku, priceNum, showOld, oldPrice, discount, matchedVariation, qty, inStock]);

  const waOrderUrl = `https://wa.me/8809610000000?text=${encodeURIComponent(detailsText)}`;

  const handleCopyDetails = async () => {
    try {
      await navigator.clipboard.writeText(detailsText);
      toast.success("Details copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-muted/30 pb-28">
      {/* Floating transparent header — becomes solid on scroll */}
      <header
        className={`fixed inset-x-0 top-0 z-40 mx-auto flex h-11 max-w-[480px] items-center gap-1 px-3 transition-all ${
          scrolled
            ? "border-x border-b border-border bg-background/95 backdrop-blur"
            : "bg-gradient-to-b from-black/40 to-transparent"
        }`}
      >
        <button
          type="button"
          onClick={() =>
            typeof window !== "undefined" && window.history.length > 1
              ? window.history.back()
              : navigate({ to: "/" })
          }
          aria-label="Back"
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors ${
            scrolled ? "hover:bg-muted" : "bg-black/25 text-white hover:bg-black/40"
          }`}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span
          className={`min-w-0 flex-1 truncate text-sm font-semibold transition-opacity ${
            scrolled ? "opacity-100" : "opacity-0"
          }`}
        >
          {p.name}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Share"
            onClick={handleShare}
            className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${
              scrolled ? "hover:bg-muted" : "bg-black/25 text-white hover:bg-black/40"
            }`}
          >
            <Share2 className="h-5 w-5" />
          </button>
          <Link
            to="/cart"
            aria-label="Cart"
            className={`relative grid h-9 w-9 place-items-center rounded-full transition-colors ${
              scrolled ? "hover:bg-muted" : "bg-black/25 text-white hover:bg-black/40"
            }`}
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-md">
        {/* Gallery */}
        <div className="relative bg-background">
          <div
            ref={galleryRef}
            onScroll={onGalleryScroll}
            onTouchStart={() => (lastInteractRef.current = Date.now())}
            onPointerDown={() => (lastInteractRef.current = Date.now())}
            className="flex aspect-square w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {(gallery.length ? gallery : [""]).map((src: string, i: number) => {
              const responsive = src ? buildResponsiveImage(src) : null;
              return (
                <div key={i} data-slide data-idx={i} className="relative aspect-square w-full shrink-0 snap-center">
                  {responsive ? (
                    <picture>
                      <source type="image/webp" srcSet={responsive.srcSetWebp} sizes={responsive.sizes} />
                      <img
                        src={responsive.src}
                        srcSet={responsive.srcSet}
                        sizes={responsive.sizes}
                        alt={p.name}
                        width={800}
                        height={800}
                        draggable={false}
                        className="h-full w-full select-none object-cover"
                        loading={i === 0 ? "eager" : "lazy"}
                        decoding={i === 0 ? "sync" : "async"}
                        fetchPriority={i === 0 ? "high" : "auto"}
                        style={i === 0 ? { viewTransitionName: "product-hero" } : undefined}
                        onError={(e) => {
                          const img = e.currentTarget;
                          img.style.display = "none";
                          const parent = img.parentElement?.parentElement;
                          if (parent && !parent.querySelector("[data-img-fallback]")) {
                            const fallback = document.createElement("div");
                            fallback.setAttribute("data-img-fallback", "");
                            fallback.className = "grid h-full w-full place-items-center bg-muted";
                            fallback.innerHTML =
                              '<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.4" class="text-muted-foreground/40"><path d="M6 3h12l3 6-9 12L3 9z"/><path d="M11 3 8 9l4 12 4-12-3-6"/><path d="M3 9h18"/></svg>';
                            parent.appendChild(fallback);
                          }
                        }}
                      />
                    </picture>
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-muted">
                      <Gem className="h-16 w-16 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {gallery.length > 1 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1">
              {gallery.map((_: string, i: number) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === activeImg ? "w-4 bg-primary" : "w-1.5 bg-background/70"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Info — blended hero block (gallery → title → variations → trust) */}
        <div className="bg-gradient-to-b from-primary/[0.04] via-background to-background">
          {/* Title + price */}
          <div className="px-4 pb-5 pt-5">
            <div className="mb-2 flex items-center gap-2">
              {p.rating_count > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Stars value={parseFloat(p.average_rating) || 0} />
                  <span className="font-semibold text-foreground">{p.average_rating}</span>
                  <span>({p.rating_count})</span>
                </span>
              )}
            </div>
            <h1 className="text-[17px] font-semibold leading-snug text-foreground">{p.name}</h1>
            <div className="mt-3 flex flex-wrap items-baseline gap-2">
              <span className="text-[26px] font-extrabold leading-none text-primary">
                {formatBDT(priceNum)}
              </span>
              {showOld && (
                <span className="text-[13px] text-muted-foreground line-through">
                  {formatBDT(oldPrice)}
                </span>
              )}
              {discount > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  Save {discount}%
                </span>
              )}
              <span
                className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${
                  inStock ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                }`}
              >
                <span
                  className={`h-1 w-1 rounded-full ${inStock ? "bg-success" : "bg-destructive"}`}
                />
                {inStock ? "In stock" : "Sold out"}
              </span>
            </div>
          </div>

          {/* Variation attribute selector — landing-page style with per-option savings */}
          {isVariable && variationAttrs.length > 0 && (
            <div className="space-y-5 px-4 pb-2 pt-1">
              {variationAttrs.map((attr) => {
                const options = attr.options ?? [];
                const current = selected[attr.name];
                return (
                  <div key={attr.id + attr.name}>
                    <div className="mb-3 flex items-center gap-3">
                      <span className="h-px w-6 bg-primary/40" aria-hidden="true" />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Choose {attr.name}
                      </span>
                      {current && (
                        <span className="ml-auto text-[11px] font-semibold text-primary">
                          {current}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {options.map((opt) => {
                        const active = current === opt;
                        const enabled = isOptionAvailable(attr.name, opt);
                        const candidates = variations.filter((v) =>
                          v.attributes.every((a) =>
                            a.name === attr.name
                              ? a.option === opt
                              : !selected[a.name] || selected[a.name] === a.option,
                          ),
                        );
                        const best =
                          candidates.find((v) => v.stock_status === "instock") ?? candidates[0];
                        const bp = best ? parseFloat(best.price) || 0 : 0;
                        const br = best ? parseFloat(best.regular_price) || 0 : 0;
                        const save = br > bp ? br - bp : 0;
                        const pct = br > bp ? Math.round((save / br) * 100) : 0;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setSelected((prev) => ({ ...prev, [attr.name]: opt }))}
                            disabled={!enabled && !active}
                            className={`group relative overflow-hidden rounded-xl border p-2.5 text-left transition-all ${
                              active
                                ? "border-primary bg-white shadow-[0_4px_16px_-6px_hsl(var(--primary)/0.35)] ring-1 ring-primary"
                                : enabled
                                  ? "border-border bg-white hover:border-primary/50 hover:shadow-sm"
                                  : "border-dashed border-border bg-muted/30 opacity-60"
                            }`}
                          >
                            {save > 0 && enabled && (
                              <span className="absolute right-1.5 top-1.5 rounded-md bg-primary px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-primary-foreground shadow-sm">
                                −{pct}%
                              </span>
                            )}
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`grid h-4 w-4 place-items-center rounded-full border transition-colors ${
                                  active
                                    ? "border-primary bg-primary"
                                    : "border-border bg-background"
                                }`}
                              >
                                {active && (
                                  <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                                )}
                              </span>
                              <span
                                className={`text-[13px] font-bold leading-tight ${
                                  enabled ? "text-foreground" : "text-muted-foreground line-through"
                                }`}
                              >
                                {opt}
                              </span>
                            </div>
                            {best && (
                              <div className="mt-1.5 pl-[22px]">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-[14px] font-extrabold leading-none text-primary">
                                    {formatBDT(bp)}
                                  </span>
                                  {save > 0 && (
                                    <span className="text-[10px] text-muted-foreground line-through">
                                      {formatBDT(br)}
                                    </span>
                                  )}
                                </div>
                                {save > 0 && enabled && (
                                  <p className="mt-1 text-[10px] font-semibold text-emerald-600">
                                    Save {formatBDT(save)}
                                  </p>
                                )}
                                {!enabled && (
                                  <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                                    Out of stock
                                  </p>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Collapsible info sections */}
        <div className="mt-2 divide-y divide-border border-y border-border bg-background">
          {highlights.length > 0 && (
            <CollapsibleSection title="Highlights" defaultOpen>
              <ul className="grid gap-3">
                {highlights.map((line, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-4 text-[13px] leading-relaxed text-muted-foreground"
                  >
                    <span
                      className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          {longDesc && (
            <CollapsibleSection title="Description">
              <div
                className="prose prose-sm max-w-none text-[13px] leading-relaxed text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: longDesc }}
              />
            </CollapsibleSection>
          )}

          <CollapsibleSection title="Product details">
            <dl className="grid grid-cols-1 gap-1 text-[13px]">
              {activeSku && (
                <InfoRow label="SKU" value={<span className="font-mono">{activeSku}</span>} />
              )}
              {p.type && (
                <InfoRow label="Type" value={<span className="capitalize">{p.type}</span>} />
              )}
              <InfoRow
                label="Availability"
                value={
                  <span className={inStock ? "text-success" : "text-destructive"}>
                    {inStock ? "In stock" : "Sold out"}
                  </span>
                }
              />
              <InfoRow label="Price" value={formatBDT(priceNum)} />
              {showOld && (
                <>
                  <InfoRow
                    label="Regular price"
                    value={
                      <span className="text-muted-foreground line-through">
                        {formatBDT(oldPrice)}
                      </span>
                    }
                  />
                  <InfoRow
                    label="You save"
                    value={
                      <span className="text-emerald-600">
                        {formatBDT(oldPrice - priceNum)} ({discount}%)
                      </span>
                    }
                  />
                </>
              )}
              {matchedVariation &&
                matchedVariation.attributes.map((a) => (
                  <InfoRow key={a.id + a.name} label={a.name} value={a.option} />
                ))}
              {p.weight && <InfoRow label="Weight" value={`${p.weight} kg`} />}
              {p.dimensions &&
                (p.dimensions.length || p.dimensions.width || p.dimensions.height) && (
                  <InfoRow
                    label="Dimensions"
                    value={`${p.dimensions.length || "—"} × ${p.dimensions.width || "—"} × ${p.dimensions.height || "—"} cm`}
                  />
                )}
              {(p.attributes ?? [])
                .filter((a) => !a.variation && a.visible !== false && (a.options?.length ?? 0) > 0)
                .map((a) => (
                  <InfoRow key={a.id + a.name} label={a.name} value={a.options!.join(", ")} />
                ))}
              {(p.categories?.length ?? 0) > 0 && (
                <InfoRow
                  label="Category"
                  value={
                    p.categories.length > 2
                      ? `${p.categories
                          .slice(0, 2)
                          .map((c) => c.name)
                          .join(", ")} +${p.categories.length - 2}`
                      : p.categories.map((c) => c.name).join(", ")
                  }
                />
              )}

              {(p.tags?.length ?? 0) > 0 && (
                <InfoRow label="Tags" value={p.tags!.map((t) => t.name).join(", ")} />
              )}
              <InfoRow label="Delivery" value="Dhaka 80 Tk · Outside 130 Tk" />
            </dl>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopyDetails}
                className="flex h-9 items-center justify-center gap-1.5 rounded-[3px] border border-border bg-background text-[12px] font-semibold text-foreground hover:border-primary hover:text-primary"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy details
              </button>
              <a
                href={waOrderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-9 items-center justify-center gap-1.5 rounded-[3px] bg-emerald-600 text-[12px] font-bold text-white hover:bg-emerald-700"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.966-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                </svg>
                Order on WhatsApp
              </a>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title={
              p.rating_count > 0 ? `Reviews · ${p.average_rating} (${p.rating_count})` : "Reviews"
            }
          >
            {p.rating_count > 0 ? (
              <div className="flex items-center gap-3">
                <div className="text-3xl font-extrabold text-foreground">{p.average_rating}</div>
                <div>
                  <Stars value={parseFloat(p.average_rating) || 0} />
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Based on {p.rating_count} verified {p.rating_count === 1 ? "review" : "reviews"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                No reviews yet. Verified customers can leave a review from their{" "}
                <Link to="/orders" className="font-semibold text-primary hover:underline">
                  orders dashboard
                </Link>{" "}
                after receiving this item.
              </p>
            )}
          </CollapsibleSection>
        </div>

        {/* Related products — lazy-loaded below the fold. content-visibility
            lets the browser skip layout/paint until the section is near the
            viewport, keeping initial render focused on the hero. */}
        <div
          className="mt-4 pb-24"
          style={{ contentVisibility: "auto", containIntrinsicSize: "1200px" }}
        >
          <Suspense fallback={<div className="h-64" aria-hidden="true" />}>
            <InfiniteFeed />
          </Suspense>
        </div>
      </div>

      {/* Mobile sticky action bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] border-x border-t border-border bg-background/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex items-center rounded-[3px] bg-secondary shadow-[var(--shadow-soft)]">
            <button
              aria-label="Decrease"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="grid h-10 w-9 place-items-center text-muted-foreground active:scale-95"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-8 text-center text-sm font-semibold">{qty}</span>
            <button
              aria-label="Increase"
              onClick={() => setQty((q) => Math.min(99, q + 1))}
              className="grid h-10 w-9 place-items-center text-primary active:scale-95"
            >
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

function CollapsibleSection({
  title,
  children,
  defaultOpen,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-4 text-left"
      >
        <span className="h-px w-6 shrink-0 bg-primary/40" aria-hidden="true" />
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-4 pb-5">{children}</div>}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-dashed border-border/60 py-1.5 last:border-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-right text-[13px] font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Stars({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, value));
  return (
    <div className="flex items-center gap-0.5" aria-label={`${v} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= Math.round(v) ? "fill-amber-400 text-amber-400" : "fill-none text-muted-foreground/40"}`}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}
