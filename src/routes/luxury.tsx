import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Gem, ChevronRight, Sparkles, ShieldCheck, Truck, ArrowRight } from "lucide-react";
import { listProducts, listCategories } from "@/lib/woo.functions";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { formatBDT } from "@/lib/format";
import { resolveCardPrices } from "@/lib/price-range";
import {
  buildResponsiveImage,
  buildThumbImage,
  onImageSrcSetError,
} from "@/lib/product-image";
import type { WooProduct } from "@/lib/woo.server";

const CANONICAL = "https://zonash.lovable.app/luxury";
const WA_HREF = `https://wa.me/8801926644575?text=${encodeURIComponent(
  "Hi Zonash, I'd like a private appointment for the Luxury Edit.",
)}`;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

const luxuryQuery = queryOptions({
  queryKey: ["luxury", "featured"],
  queryFn: () =>
    listProducts({
      data: { page: 1, perPage: 24, featured: true, orderby: "price", order: "desc" },
    }),
  staleTime: 60_000,
});

const luxuryTopQuery = queryOptions({
  queryKey: ["luxury", "top"],
  queryFn: () =>
    listProducts({ data: { page: 1, perPage: 12, orderby: "price", order: "desc" } }),
  staleTime: 60_000,
});

const catsQuery = queryOptions({
  queryKey: ["luxury", "categories"],
  queryFn: () => listCategories(),
  staleTime: 300_000,
});

export const Route = createFileRoute("/luxury")({
  head: () => ({
    meta: [
      { title: "The Luxury Edit · Zonash Fine Jewelry" },
      {
        name: "description",
        content:
          "Zonash's most exceptional pieces — heritage stones, hand-finished settings and limited editions, delivered insured across Bangladesh.",
      },
      { property: "og:title", content: "The Luxury Edit · Zonash" },
      {
        property: "og:description",
        content: "Rare, hand-crafted and unforgettable jewelry from the Zonash atelier.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(luxuryQuery);
    context.queryClient.ensureQueryData(luxuryTopQuery);
    context.queryClient.ensureQueryData(catsQuery);
  },
  component: LuxuryPage,
  pendingComponent: LuxurySkeleton,
  errorComponent: LuxuryError,
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <CheckoutHeader title="The Luxury Edit" />
      <main className="mx-auto w-full max-w-[480px] flex-1 px-3 pb-24 pt-3">{children}</main>
    </div>
  );
}

function LuxuryError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Shell>
      <div className="mt-24 flex flex-col items-center gap-3 text-center">
        <Gem className="h-8 w-8 text-gold" aria-hidden="true" />
        <p className="text-[13px] text-muted-foreground">
          The Luxury Edit could not be loaded right now.
        </p>
        <button
          type="button"
          onClick={reset}
          className={`inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-[13px] font-semibold text-primary-foreground ${focusRing}`}
        >
          Try again
        </button>
      </div>
    </Shell>
  );
}

function LuxurySkeleton() {
  return (
    <Shell>
      <div className="h-[300px] animate-pulse rounded-2xl bg-muted" />
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="mt-6 flex gap-2 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[104px] w-[72px] shrink-0 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </Shell>
  );
}

function LuxuryPage() {
  const { data: feat } = useSuspenseQuery(luxuryQuery);
  const { data: top } = useSuspenseQuery(luxuryTopQuery);
  const { data: catData } = useSuspenseQuery(catsQuery);

  const products = (feat.products.length ? feat.products : top.products) as WooProduct[];
  const hero = products[0];
  const grid = products.slice(1);
  const cats = catData.categories.slice(0, 10);

  const heroImg = buildResponsiveImage(hero?.images?.[0]?.src, {
    sizes: "(min-width: 480px) 480px, 100vw",
  });

  return (
    <Shell>
      {/* Hero */}
      <section
        aria-labelledby="luxury-hero"
        className="relative overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-card"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-primary-glow/30">
          {heroImg ? (
            <img
              src={heroImg.src}
              srcSet={heroImg.srcSet || undefined}
              sizes={heroImg.sizes}
              alt={hero?.images?.[0]?.alt || hero?.name || "Featured luxury piece"}
              fetchPriority="high"
              decoding="async"
              onError={onImageSrcSetError}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center">
              <Gem className="h-10 w-10 text-gold/60" aria-hidden="true" />
            </div>
          )}
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary via-primary/45 to-transparent"
            aria-hidden="true"
          />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gold-foreground">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              L&apos;Atelier de Luxe
            </span>
            <h2
              id="luxury-hero"
              className="mt-2 font-display text-[22px] font-semibold leading-tight"
            >
              Crafting <span className="italic text-gold">radiance</span> in every detail
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-primary-foreground/80">
              Limited hand-finished pieces, insured delivery nationwide.
            </p>
          </div>
        </div>

        <div className="flex gap-2 p-3">
          <a
            href="#luxury-collection"
            className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-gold px-3 text-[13px] font-semibold text-gold-foreground transition-transform active:scale-[0.98] ${focusRing}`}
          >
            Explore the edit
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
          {hero ? (
            <Link
              to="/products/$slug"
              params={{ slug: hero.slug }}
              preload="intent"
              className={`inline-flex min-h-11 items-center justify-center rounded-full bg-primary-foreground px-4 text-[13px] font-semibold text-primary transition-transform active:scale-[0.98] ${focusRing}`}
            >
              View piece
            </Link>
          ) : null}
        </div>
      </section>

      {/* Assurances */}
      <ul className="mt-3 grid grid-cols-3 gap-2">
        <Assurance icon={Gem} label="Hand-finished" hint="Atelier crafted" />
        <Assurance icon={ShieldCheck} label="Certified" hint="Quality checked" />
        <Assurance icon={Truck} label="Insured" hint="Nationwide" />
      </ul>

      {/* Houses */}
      {cats.length > 0 && (
        <section aria-labelledby="luxury-houses">
          <div className="mt-6 flex items-end justify-between px-1">
            <h3 id="luxury-houses" className="text-[13px] font-semibold">
              Curated by house
            </h3>
            <Link
              to="/categories"
              preload="intent"
              className={`inline-flex items-center text-[12px] font-medium text-muted-foreground ${focusRing}`}
            >
              All
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {cats.map((c) => {
              const t = buildThumbImage(c.image?.src, 72);
              return (
                <Link
                  key={c.id}
                  to="/c/$slug"
                  params={{ slug: c.slug }}
                  preload="intent"
                  className={`w-[72px] shrink-0 ${focusRing}`}
                >
                  <div className="aspect-square overflow-hidden rounded-2xl bg-muted ring-1 ring-gold/25">
                    {t ? (
                      <img
                        src={t.src}
                        srcSet={t.srcSet || undefined}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        width={72}
                        height={72}
                        onError={onImageSrcSetError}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-gold/50">
                        <Gem className="h-5 w-5" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-center text-[10px] font-medium leading-tight text-muted-foreground">
                    {c.name}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Collection */}
      <section id="luxury-collection" aria-labelledby="luxury-collection-title" className="scroll-mt-14">
        <div className="mt-6 flex items-center gap-2 px-1">
          <h3 id="luxury-collection-title" className="text-[13px] font-semibold">
            The collection
          </h3>
          <span className="h-px flex-1 bg-gold/30" aria-hidden="true" />
          <span className="text-[11px] text-muted-foreground">{grid.length} pieces</span>
        </div>

        {grid.length > 0 ? (
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            {grid.map((p, i) => (
              <LuxuryCard key={p.id} product={p} priority={i < 4} />
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-2xl border border-border bg-card px-4 py-8 text-center text-[13px] text-muted-foreground">
            Our luxury edit is being curated. Please check back shortly.
          </p>
        )}
      </section>

      {/* Concierge */}
      <a
        href={WA_HREF}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Book a private appointment on WhatsApp (opens in a new tab)"
        className={`mt-6 flex items-center gap-3 rounded-2xl bg-primary px-4 py-4 text-primary-foreground transition-transform active:scale-[0.99] ${focusRing}`}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold text-gold-foreground">
          <WhatsAppIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold">Private appointment</span>
          <span className="block text-[12px] text-primary-foreground/75">
            Bespoke pieces & sizing · 10 AM – 10 PM
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
      </a>

      <Link
        to="/products"
        preload="intent"
        className={`mt-3 flex h-11 items-center justify-center rounded-full bg-secondary text-[13px] font-semibold text-secondary-foreground transition-transform active:scale-[0.99] ${focusRing}`}
      >
        Browse the full shop
      </Link>
    </Shell>
  );
}

function Assurance({
  icon: Icon,
  label,
  hint,
}: {
  icon: typeof Gem;
  label: string;
  hint: string;
}) {
  return (
    <li className="rounded-2xl border border-border bg-card px-2 py-2.5 text-center">
      <Icon className="mx-auto h-4 w-4 text-gold" aria-hidden="true" />
      <div className="mt-1 text-[11px] font-semibold leading-tight">{label}</div>
      <div className="text-[10px] leading-tight text-muted-foreground">{hint}</div>
    </li>
  );
}

function LuxuryCard({ product: p, priority }: { product: WooProduct; priority: boolean }) {
  const img = buildResponsiveImage(p.images?.[0]?.src, {
    sizes: "(min-width: 480px) 236px, 48vw",
  });
  const { sell, regular } = resolveCardPrices(p);
  const sellNum = typeof sell === "string" ? Number.parseFloat(sell) : sell;
  const regNum = typeof regular === "string" ? Number.parseFloat(regular) : regular;
  const showRegular =
    Number.isFinite(regNum as number) &&
    Number.isFinite(sellNum as number) &&
    (regNum as number) > (sellNum as number);

  return (
    <Link
      to="/products/$slug"
      params={{ slug: p.slug }}
      preload="intent"
      className={`group overflow-hidden rounded-2xl border border-border bg-card transition-transform active:scale-[0.99] ${focusRing}`}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-muted">
        {img ? (
          <img
            src={img.src}
            srcSet={img.srcSet || undefined}
            sizes={img.sizes}
            alt={p.images?.[0]?.alt || p.name}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            onError={onImageSrcSetError}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-gold/50">
            <Gem className="h-7 w-7" aria-hidden="true" />
          </div>
        )}
        {showRegular && (
          <span className="absolute left-2 top-2 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-gold-foreground">
            Sale
          </span>
        )}
      </div>
      <div className="px-2.5 py-2">
        <h4 className="line-clamp-2 text-[12px] font-medium leading-snug">{p.name}</h4>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[13px] font-bold text-primary">{formatBDT(sell)}</span>
          {showRegular && (
            <span className="text-[11px] text-muted-foreground line-through">
              {formatBDT(regular)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
