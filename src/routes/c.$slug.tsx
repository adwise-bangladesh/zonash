import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useInfiniteQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { getCategoryWithSubs, listProducts } from "@/lib/woo.functions";
import { AppHeader } from "@/components/AppHeader";
import { BigProductGrid } from "@/components/home/BigProductGrid";
import { NotFoundView } from "@/components/NotFoundView";
import type { WooProduct } from "@/lib/woo.server";

const categoryQuery = (slug: string) =>
  queryOptions({
    queryKey: ["collection", slug],
    queryFn: () => getCategoryWithSubs({ data: { slug } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/c/$slug")({
  loader: ({ params, context }) => {
    if (params.slug === "demo") return;
    return context.queryClient.ensureQueryData(categoryQuery(params.slug));
  },
  head: ({ params }) => {
    const pretty = params.slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    return {
      meta: [
        { title: `${pretty} — Zonash` },
        { name: "description", content: `Shop ${pretty} at Zonash.` },
        { property: "og:title", content: `${pretty} — Zonash` },
        { property: "og:description", content: `Curated ${pretty} collection from Zonash.` },
      ],
    };
  },
  component: CollectionPage,
  pendingComponent: CollectionSkeleton,
  errorComponent: ({ error, reset }) => (
    <NotFoundView
      variant="error"
      title="Couldn't load this collection"
      description={error.message}
      onRetry={() => reset()}
    />
  ),
  notFoundComponent: () => (
    <NotFoundView
      title="Collection not found"
      description="This category doesn't exist yet. Browse everything else in the shop."
      primaryLabel="Browse all"
      primaryTo="/products"
    />
  ),
});

function CollectionPage() {
  const { slug } = Route.useParams();
  if (slug === "demo") return <DemoCollection />;
  const { data } = useSuspenseQuery(categoryQuery(slug));
  const parent = data.parent;
  const subs = data.subs;

  return (
    <div className="min-h-screen bg-surface-muted/40">
      <AppHeader />
      <main>
        <div className="bg-background pt-2">
          {subs.length > 0 && <SubcategoryStrip parentSlug={slug} subs={subs} />}
        </div>

        <CategoryProductFeed categoryId={parent?.id ?? null} />
      </main>
    </div>
  );
}

function SubcategoryStrip({
  parentSlug,
  subs,
}: {
  parentSlug: string;
  subs: { id: number; name: string; slug: string; image: { src: string; alt: string } | null }[];
}) {
  const many = subs.length > 5;
  return (
    <nav aria-label="Subcategories" className="pb-4">
      {many ? (
        <ul
          className="flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-[5px] px-[5px] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {subs.map((s) => (
            <li
              key={s.id}
              className="shrink-0 basis-[18%] snap-start md:basis-[14%] lg:basis-[10%]"
            >
              <SubCard parentSlug={parentSlug} sub={s} />
            </li>
          ))}
        </ul>
      ) : (
        <ul
          className="grid gap-2 px-[5px]"
          style={{ gridTemplateColumns: `repeat(${subs.length}, minmax(0, 1fr))` }}
        >
          {subs.map((s) => (
            <li key={s.id}>
              <SubCard parentSlug={parentSlug} sub={s} />
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

function SubCard({
  parentSlug,
  sub,
}: {
  parentSlug: string;
  sub: { id: number; name: string; slug: string; image: { src: string; alt: string } | null };
}) {
  return (
    <Link
      to="/c/$slug"
      params={{ slug: sub.slug }}
      preload="intent"
      className="group flex flex-col items-center gap-1.5"
      aria-label={`${sub.name} in ${parentSlug}`}
    >
      <span className="block aspect-square w-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-border/60 transition-shadow group-hover:shadow-md">
        {sub.image?.src ? (
          <img
            src={sub.image.src}
            alt={sub.image.alt || sub.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="grid h-full w-full place-items-center bg-surface-muted text-muted-foreground/60">
            <LayoutGrid className="h-5 w-5" />
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-center text-[11px] font-medium leading-tight text-ink md:text-[12px]">
        {sub.name}
      </span>
    </Link>
  );
}

function CategoryProductFeed({ categoryId }: { categoryId: number | null }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const enabled = !!categoryId;

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ["collection", "feed", categoryId],
      enabled,
      initialPageParam: 1,
      queryFn: ({ pageParam }) =>
        listProducts({
          data: {
            page: pageParam as number,
            perPage: 16,
            category: String(categoryId),
            orderby: "date",
          },
        }),
      getNextPageParam: (last, all) =>
        last.products.length < 16 ? undefined : all.length + 1,
      staleTime: 60_000,
    });

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const products: WooProduct[] =
    data?.pages.flatMap((p) => p.products as WooProduct[]) ?? [];

  if (!enabled) {
    return (
      <NotFoundView
        variant="empty"
        title="Collection unavailable"
        description="This collection isn't set up yet. Explore the rest of the shop while we get it ready."
      />
    );
  }

  if (isLoading && products.length === 0) return <FeedSkeleton />;

  if (products.length === 0) {
    return (
      <NotFoundView
        variant="empty"
        title="The shelves are being restocked"
        description="We're curating fresh pieces for this collection. New arrivals drop weekly — check back soon."
        primaryLabel="Explore homepage"
      />
    );
  }

  return (
    <>
      <BigProductGrid products={products} />
      <div ref={sentinel} className="flex items-center justify-center py-6 text-muted-foreground">
        {isFetchingNextPage && (
          <span className="inline-flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading more…
          </span>
        )}
        {!hasNextPage && products.length > 0 && (
          <span className="text-xs text-muted-foreground/70">You've reached the end ✦</span>
        )}
      </div>
    </>
  );
}

function FeedSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 px-[5px] pt-3 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="skeleton-shimmer aspect-[3/4] rounded-2xl"
          style={{ animationDelay: `${i * 40}ms` }}
        />
      ))}
    </div>
  );
}

function CollectionSkeleton() {
  return (
    <div className="min-h-screen bg-surface-muted/40">
      <div className="h-14 border-b border-border/60 bg-background" />
      <div className="bg-background pt-3">
        <div className="container-page mb-3 h-5 w-40 skeleton-shimmer rounded" />
        <div className="flex gap-2 overflow-hidden px-[5px] pb-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="basis-[18%] shrink-0">
              <div className="aspect-square w-full skeleton-shimmer rounded-2xl" />
              <div className="mx-auto mt-1.5 h-2.5 w-3/4 skeleton-shimmer rounded" />
            </div>
          ))}
        </div>
      </div>
      <FeedSkeleton />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state — soft gradient card with a floating parcel icon        */
/* ------------------------------------------------------------------ */
function CollectionEmpty() {
  return (
    <div className="px-[5px] pt-4 pb-16">
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/5 via-background to-amber-50/60 px-6 py-14 text-center shadow-sm">
        {/* Decorative sparkles */}
        <span aria-hidden="true" className="pointer-events-none absolute left-6 top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
        <span aria-hidden="true" className="pointer-events-none absolute right-8 bottom-8 h-32 w-32 rounded-full bg-amber-200/40 blur-3xl" />

        <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
          <span aria-hidden="true" className="absolute inset-0 rounded-full bg-white shadow-md ring-1 ring-border/60" />
          <PackageOpen className="relative h-11 w-11 text-primary" strokeWidth={1.5} />
          <Sparkles className="absolute -right-1 -top-1 h-5 w-5 text-amber-500" strokeWidth={2} />
        </div>

        <h2 className="mt-6 font-display text-[18px] font-bold tracking-tight text-ink md:text-[20px]">
          The shelves are being restocked
        </h2>
        <p className="mx-auto mt-2 max-w-[22rem] text-[12.5px] leading-relaxed text-muted-foreground">
          We're curating fresh pieces for this collection. New arrivals drop weekly — be the first to see them.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button asChild size="sm" className="rounded-full px-5">
            <Link to="/">Explore homepage</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-full px-5">
            <Link to="/c/$slug" params={{ slug: "new-arrivals" }}>
              <BellRing className="mr-1.5 h-3.5 w-3.5" /> See new arrivals
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Demo collection with dummy data (open /c/demo to preview design)    */
/* ------------------------------------------------------------------ */
const DEMO_SUBS = [
  { id: 1, name: "Necklaces", slug: "demo", image: { src: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=400&q=80", alt: "" } },
  { id: 2, name: "Earrings", slug: "demo", image: { src: "https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?w=400&q=80", alt: "" } },
  { id: 3, name: "Rings", slug: "demo", image: { src: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=400&q=80", alt: "" } },
  { id: 4, name: "Bracelets", slug: "demo", image: { src: "https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=400&q=80", alt: "" } },
  { id: 5, name: "Anklets", slug: "demo", image: { src: "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=400&q=80", alt: "" } },
  { id: 6, name: "Sets", slug: "demo", image: { src: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400&q=80", alt: "" } },
  { id: 7, name: "Bridal", slug: "demo", image: { src: "https://images.unsplash.com/photo-1602751584552-8ba73aad10e1?w=400&q=80", alt: "" } },
];

const DEMO_IMAGES = [
  "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&q=80",
  "https://images.unsplash.com/photo-1617038220319-276d3cfab638?w=600&q=80",
  "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=600&q=80",
  "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?w=600&q=80",
  "https://images.unsplash.com/photo-1633810542706-90e5ff7557be?w=600&q=80",
  "https://images.unsplash.com/photo-1506630448388-4e683c67ddb0?w=600&q=80",
  "https://images.unsplash.com/photo-1620619032909-1c8b76c85e50?w=600&q=80",
  "https://images.unsplash.com/photo-1523251343397-9225e4cb6319?w=600&q=80",
];

function makeDemoProducts(): WooProduct[] {
  const names = [
    "Amara Pearl Drop",
    "Zara Gold Hoop",
    "Nova Stellar Ring",
    "Luna Chain Bracelet",
    "Iris Bloom Studs",
    "Aria Choker",
    "Selene Anklet",
    "Celeste Bridal Set",
  ];
  return names.map((name, i) => ({
    id: 10_000 + i,
    name,
    slug: `demo-${i}`,
    price: String(1290 + i * 240),
    regular_price: String(1690 + i * 260),
    sale_price: String(1290 + i * 240),
    on_sale: i % 2 === 0,
    stock_status: i === 3 ? "onbackorder" : "instock",
    images: [{ id: i, src: DEMO_IMAGES[i % DEMO_IMAGES.length], alt: name }],
    categories: [{ id: 1, name: "Demo", slug: "demo" }],
    permalink: "#",
    short_description: "",
    description: "",
    average_rating: "4.8",
    rating_count: 24 + i,
    total_sales: 100 + i * 12,
  } as unknown as WooProduct));
}

function DemoCollection() {
  const products = makeDemoProducts();
  return (
    <div className="min-h-screen bg-surface-muted/40">
      <AppHeader />
      <main>
        <div className="bg-background pt-2">
          <SubcategoryStrip parentSlug="demo" subs={DEMO_SUBS} />
        </div>
        <BigProductGrid products={products} />
        <div className="flex items-center justify-center py-6">
          <span className="text-xs text-muted-foreground/70">Demo preview — dummy data ✦</span>
        </div>
      </main>
    </div>
  );
}
