import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Gem, Heart } from "lucide-react";
import { listProducts, listCategories } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { formatBDT } from "@/lib/format";
import type { WooProduct } from "@/lib/woo.server";

const luxuryQuery = queryOptions({
  queryKey: ["luxury", "featured"],
  queryFn: () =>
    listProducts({
      data: { page: 1, perPage: 24, featured: true, orderby: "price", order: "desc" },
    }),
});

const luxuryTopQuery = queryOptions({
  queryKey: ["luxury", "top"],
  queryFn: () =>
    listProducts({ data: { page: 1, perPage: 12, orderby: "price", order: "desc" } }),
});

const catsQuery = queryOptions({
  queryKey: ["luxury", "categories"],
  queryFn: () => listCategories(),
});

export const Route = createFileRoute("/luxury")({
  head: () => ({
    meta: [
      { title: "The Luxury Edit — Zonash Fine Jewelry" },
      {
        name: "description",
        content:
          "Zonash's most exceptional pieces — heritage stones, hand-finished settings, and limited editions.",
      },
      { property: "og:title", content: "The Luxury Edit — Zonash" },
      {
        property: "og:description",
        content:
          "Discover our most exceptional jewelry: rare, hand-crafted, and unforgettable.",
      },
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
  const grid = products.slice(1);
  const cats = catData.categories.slice(0, 8);

  return (
    <div className="min-h-screen bg-[#fffcf9]">
      <AppHeader />
      <main
        className="px-4 py-12 md:px-8 lg:px-12"
        style={{ fontFamily: "'Montserrat', ui-sans-serif, system-ui, sans-serif" }}
      >
        {/* Brand Header */}
        <header className="mx-auto mb-16 max-w-7xl text-center">
          <h1 className="mb-2 font-display text-5xl font-light uppercase tracking-tight text-[#3a0203] md:text-7xl">
            Zonash
          </h1>
          <div className="flex items-center justify-center gap-4">
            <span className="h-px w-12 bg-[#c5a059]" />
            <span className="text-xs font-medium uppercase tracking-[0.3em] text-[#c5a059]">
              Fine Jewelry
            </span>
            <span className="h-px w-12 bg-[#c5a059]" />
          </div>
        </header>

        {/* Hero */}
        <section className="relative mx-auto mb-24 max-w-7xl overflow-hidden rounded-sm bg-[#3a0203]">
          <div className="grid items-center md:grid-cols-2">
            <div className="z-10 p-12 text-white lg:p-20">
              <span className="mb-4 block text-sm uppercase tracking-widest text-[#c5a059]">
                L'Atelier de Luxe
              </span>
              <h2 className="mb-8 font-display text-4xl font-light leading-tight lg:text-6xl">
                Crafting <span className="italic text-[#c5a059]">Radiance</span> in Every Detail
              </h2>
              <p className="mb-10 max-w-md font-light leading-relaxed text-white/70">
                Experience the pinnacle of Bangladeshi craftsmanship. Each piece is a testament to
                our heritage, dipped in gold and legacy.
              </p>
              <a
                href="#collection"
                className="inline-block border border-[#c5a059] px-10 py-4 text-xs uppercase tracking-widest text-[#c5a059] transition-all duration-500 hover:bg-[#c5a059] hover:text-white"
              >
                Explore Collection
              </a>
            </div>
            <div className="relative min-h-[400px] md:h-full md:min-h-[520px]">
              {hero?.images[0] ? (
                <Link
                  to="/products/$slug"
                  params={{ slug: hero.slug }}
                  preload="intent"
                  className="block h-full w-full"
                >
                  <img
                    src={hero.images[0].src}
                    alt={hero.images[0].alt || hero.name}
                    className="h-full w-full object-cover"
                  />
                </Link>
              ) : (
                <div className="grid h-full w-full place-items-center bg-black/30">
                  <Gem className="h-16 w-16 text-[#c5a059]/50" />
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#3a0203] via-transparent to-transparent" />
            </div>
          </div>
        </section>

        {/* Category Rail */}
        {cats.length > 0 && (
          <section className="mx-auto mb-24 max-w-7xl">
            <div className="mb-8 flex items-end justify-between px-2">
              <div>
                <h3 className="font-display text-3xl text-[#3a0203]">Curated by House</h3>
                <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                  Select your aesthetic
                </p>
              </div>
              <div className="mx-8 mb-4 h-px flex-grow bg-[#c5a059]/30" />
            </div>

            <div className="flex gap-6 overflow-x-auto px-2 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {cats.map((c) => (
                <Link
                  key={c.id}
                  to="/products"
                  search={{ category: c.slug }}
                  className="group flex-shrink-0 cursor-pointer"
                >
                  <div className="h-52 w-40 overflow-hidden border border-[#c5a059]/20 transition-all duration-500 group-hover:border-[#c5a059]">
                    {c.image?.src ? (
                      <img
                        src={c.image.src}
                        alt={c.image.alt || c.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-[#fdfaf6] text-[#c5a059]/40">
                        <Gem className="h-10 w-10" />
                      </div>
                    )}
                  </div>
                  <p className="mt-4 text-center text-[10px] font-semibold uppercase tracking-widest text-[#3a0203]">
                    {c.name}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Product Grid */}
        <section id="collection" className="mx-auto mb-12 max-w-7xl">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-3">
            {grid.map((p) => {
              const price = p.on_sale && p.sale_price ? p.sale_price : p.price;
              return (
                <Link
                  key={p.id}
                  to="/products/$slug"
                  params={{ slug: p.slug }}
                  preload="intent"
                  className="group cursor-pointer"
                >
                  <div className="relative mb-6 aspect-[4/5] overflow-hidden border border-transparent bg-[#fdfaf6] transition-colors group-hover:border-[#c5a059]/30">
                    {p.images[0] ? (
                      <img
                        src={p.images[0].src}
                        alt={p.images[0].alt || p.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-[#c5a059]/40">
                        <Gem className="h-12 w-12" />
                      </div>
                    )}
                    <div className="absolute right-4 top-4 text-[#c5a059] opacity-0 transition-opacity group-hover:opacity-100">
                      <Heart className="h-6 w-6" strokeWidth={1} />
                    </div>
                  </div>
                  <div className="text-center">
                    <h4 className="font-display text-xl text-[#3a0203] transition-colors group-hover:text-[#c5a059]">
                      {p.name}
                    </h4>
                    <p className="mt-2 text-sm font-medium text-[#c5a059]">{formatBDT(price)}</p>
                    <div className="mt-4 flex items-center justify-center">
                      <span className="border-b border-transparent pb-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition-all group-hover:border-[#3a0203] group-hover:text-[#3a0203]">
                        Request Bespoke Appointment
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          {!products.length && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Our luxury edit is being curated. Please check back shortly.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
