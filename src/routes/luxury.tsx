import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Crown, Sparkles, Gem, ShieldCheck } from "lucide-react";
import { listProducts, listCategories } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { BigProductGrid } from "@/components/home/BigProductGrid";
import type { WooProduct } from "@/lib/woo.server";

const luxuryQuery = queryOptions({
  queryKey: ["luxury", "featured"],
  queryFn: () => listProducts({ data: { page: 1, perPage: 24, featured: true, orderby: "price", order: "desc" } }),
});

const luxuryTopQuery = queryOptions({
  queryKey: ["luxury", "top"],
  queryFn: () => listProducts({ data: { page: 1, perPage: 8, orderby: "price", order: "desc" } }),
});

const catsQuery = queryOptions({
  queryKey: ["luxury", "categories"],
  queryFn: () => listCategories(),
});

export const Route = createFileRoute("/luxury")({
  head: () => ({
    meta: [
      { title: "The Luxury Edit — Zonash Fine Jewelry" },
      { name: "description", content: "Zonash's most exceptional pieces — rare stones, heritage craftsmanship, and limited editions." },
      { property: "og:title", content: "The Luxury Edit — Zonash" },
      { property: "og:description", content: "Discover our most exceptional jewelry: rare, hand-crafted, and unforgettable." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(luxuryQuery);
    context.queryClient.ensureQueryData(luxuryTopQuery);
    context.queryClient.ensureQueryData(catsQuery);
  },
  component: LuxuryPage,
});

function LuxuryPage() {
  const { data: feat } = useSuspenseQuery(luxuryQuery);
  const { data: top } = useSuspenseQuery(luxuryTopQuery);
  const { data: catData } = useSuspenseQuery(catsQuery);
  const products = (feat.products.length ? feat.products : top.products) as WooProduct[];
  const hero = products[0];

  return (
    <div className="min-h-screen bg-[#faf7f2]">
      <AppHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#1a0304] via-[#2a0405] to-[#3a0203] text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, rgba(212,175,55,0.35), transparent 40%), radial-gradient(circle at 80% 60%, rgba(212,175,55,0.2), transparent 45%)",
            }}
          />
          <div className="container-page relative grid gap-8 py-14 md:grid-cols-2 md:py-20">
            <div className="flex flex-col justify-center">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/40 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200 backdrop-blur">
                <Crown className="h-3.5 w-3.5" /> The Luxury Edit
              </span>
              <h1 className="mt-5 font-display text-4xl leading-[1.05] tracking-tight md:text-6xl">
                Rare pieces,
                <br />
                <span className="bg-gradient-to-r from-amber-200 via-amber-300 to-amber-100 bg-clip-text text-transparent">
                  quietly extraordinary.
                </span>
              </h1>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/70">
                A curated house selection — heritage stones, hand-finished settings, and limited
                editions for occasions that deserve a legend.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a
                  href="#collection"
                  className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-[#3a0203] transition hover:brightness-105"
                >
                  Explore the collection
                </a>
                <Link
                  to="/support"
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-3 text-sm font-medium text-white/90 hover:bg-white/10"
                >
                  Private consultation
                </Link>
              </div>
              <div className="mt-8 grid max-w-md grid-cols-3 gap-4 text-[11px] uppercase tracking-widest text-white/60">
                <div className="flex items-center gap-1.5"><Gem className="h-3.5 w-3.5 text-amber-300" /> Certified</div>
                <div className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-amber-300" /> Lifetime care</div>
                <div className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-amber-300" /> Bespoke</div>
              </div>
            </div>

            {hero && (
              <Link
                to="/products/$slug"
                params={{ slug: hero.slug }}
                preload="intent"
                className="group relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-2xl ring-1 ring-amber-200/30 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]"
              >
                {hero.images[0] ? (
                  <img
                    src={hero.images[0].src}
                    alt={hero.images[0].alt || hero.name}
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-black/30"><Gem className="h-16 w-16 text-amber-200/50" /></div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5">
                  <p className="text-[11px] uppercase tracking-widest text-amber-200/90">Signature piece</p>
                  <p className="mt-1 line-clamp-2 font-display text-lg text-white">{hero.name}</p>
                </div>
              </Link>
            )}
          </div>
        </section>

        {/* Category rail */}
        {catData.categories.length > 0 && (
          <section className="border-b border-black/5 bg-white">
            <div className="container-page py-6">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-display text-xl text-ink">Curated by house</h2>
                <Link to="/products" className="text-xs uppercase tracking-widest text-primary hover:underline">
                  View all
                </Link>
              </div>
              <div className="scroll-snap-x flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {catData.categories.slice(0, 10).map((c) => (
                  <Link
                    key={c.id}
                    to="/products"
                    search={{ category: c.slug }}
                    className="group shrink-0 snap-start"
                  >
                    <div className="relative h-32 w-40 overflow-hidden rounded-xl bg-[#f2ece2] ring-1 ring-black/5 md:h-36 md:w-52">
                      {c.image?.src ? (
                        <img
                          src={c.image.src}
                          alt={c.image.alt || c.name}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-primary/30"><Gem className="h-10 w-10" /></div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      <p className="absolute inset-x-3 bottom-2 font-display text-sm text-white">{c.name}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Collection */}
        <section id="collection" className="py-8">
          <div className="container-page mb-4 flex items-baseline gap-2">
            <Crown className="h-4 w-4 text-amber-500" />
            <h2 className="font-display text-2xl text-ink">The Luxury Edit</h2>
          </div>
          <BigProductGrid products={products} />
          {!products.length && (
            <p className="container-page py-16 text-center text-sm text-muted-foreground">
              Our luxury edit is being curated. Please check back shortly.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
