import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, queryOptions } from "@tanstack/react-query";
import * as React from "react";
import { z } from "zod";
import { LayoutGrid, ArrowRight, Home, Search } from "lucide-react";
import { listPrimaryCategories, getCategoryWithSubs } from "@/lib/woo.functions";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { NotFoundView } from "@/components/NotFoundView";

const searchSchema = z.object({
  parent: z.string().min(1).max(96).regex(/^[a-z0-9-]+$/).optional().catch(undefined),
});

const categoriesQuery = queryOptions({
  queryKey: ["categories", "primary"],
  queryFn: () => listPrimaryCategories(),
});

const subsQuery = (slug: string) =>
  queryOptions({
    queryKey: ["categories", "subs", slug],
    queryFn: () => getCategoryWithSubs({ data: { slug } }),
    staleTime: 300_000,
  });

export const Route = createFileRoute("/categories")({
  validateSearch: (s) => searchSchema.parse(s),
  loader: ({ context }) => context.queryClient.ensureQueryData(categoriesQuery),
  head: () => ({
    meta: [
      { title: "Shop by category — Zonash" },
      { name: "description", content: "Browse every jewelry category at Zonash." },
      { property: "og:title", content: "Shop by category — Zonash" },
      { property: "og:description", content: "Explore rings, chains, earrings and more." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const { parent } = Route.useSearch();
  const navigate = useNavigate({ from: "/categories" });
  const { data } = useSuspenseQuery(categoriesQuery);
  const cats = data.categories;

  const railRef = useRef<HTMLUListElement>(null);
  const activeSlug = parent ?? cats[0]?.slug;

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !activeSlug) return;
    const el = rail.querySelector<HTMLElement>(`[data-slug="${activeSlug}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeSlug]);

  if (!cats.length) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <CheckoutHeader title="Categories" />
        <main className="flex flex-1 items-center justify-center">
          <EmptyState icon={LayoutGrid} title="No categories yet" description="Check back soon — we're stocking the shelves." primary={{ label: "Continue shopping", to: "/products" }} />
        </main>
      </div>
    );
  }

  const active = cats.find((c) => c.slug === activeSlug) ?? cats[0];
  const parentMissing = !!parent && !cats.some((c) => c.slug === parent);

  const selectCategory = (slug: string) => {
    if (slug === activeSlug) return;
    void navigate({ search: { parent: slug }, replace: true });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <CheckoutHeader title="Categories" showBack={false} />
      <main className="min-h-0 flex-1">
        <div className="grid min-h-[calc(100dvh-44px)] w-full grid-cols-[76px_minmax(0,1fr)]">
          {/* Left rail: main parent categories */}
          <aside className="border-r border-border bg-surface-muted">
            <nav aria-label="Parent categories" className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <ul ref={railRef} className="pb-24">
                {cats.map((c) => {
                  const isActive = c.slug === active.slug;
                  return (
                    <li key={c.slug} data-slug={c.slug}>
                      <button
                        type="button"
                        onClick={() => selectCategory(c.slug)}
                        aria-pressed={isActive}
                        className={`relative flex w-full flex-col items-center gap-1 px-1 py-2 text-center transition-colors ${
                          isActive ? "bg-background" : "text-foreground active:bg-background/60"
                        }`}
                      >
                        {isActive && (
                          <span aria-hidden="true" className="absolute left-0 top-1/2 h-7 w-[2px] -translate-y-1/2 rounded-r bg-primary" />
                        )}
                        <span className={`block h-10 w-10 shrink-0 overflow-hidden rounded-[3px] ring-1 ${isActive ? "ring-primary/50" : "ring-border"}`}>
                          {c.image?.src ? (
                            <img src={c.image.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                          ) : (
                            <span className="grid h-full w-full place-items-center bg-muted text-muted-foreground"><LayoutGrid className="h-4 w-4" /></span>
                          )}
                        </span>
                        <span className={`block w-full truncate text-[10px] font-semibold leading-tight ${isActive ? "text-primary" : "text-foreground"}`}>
                          {c.name}
                        </span>

                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          {/* Right pane: sub categories of the active parent */}
          <section className="min-h-0 overflow-y-auto">
            {parentMissing ? (
              <NotFoundView
                bare
                variant="not-found"
                title="Category not found"
                description={`"${parent}" doesn't exist anymore. Pick a category from the list or browse the full shop.`}
                primaryLabel="Browse all products"
                primaryTo="/products"
              />
            ) : (
              <SubCategories slug={active.slug} name={active.name} />
            )}
          </section>

        </div>
      </main>
    </div>
  );
}

function SubCategories({ slug, name }: { slug: string; name: string }) {
  const { data, isLoading } = useQuery(subsQuery(slug));
  const subs = data?.subs ?? [];

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-2.5 py-1.5 backdrop-blur">
        <h2 className="min-w-0 truncate text-[12.5px] font-bold tracking-tight">{name}</h2>
        <Link
          to="/c/$slug"
          params={{ slug }}
          className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary"
        >
          View all
        </Link>
      </div>

      <div className="px-1.5 pt-1.5">
        {isLoading ? (
          <GridSkeleton />
        ) : subs.length === 0 ? (
          <CompactEmpty
            name={name}
            slug={slug}
          />
        ) : (
          <ul className="grid grid-cols-3 gap-x-1 gap-y-1.5">
            {subs.map((s) => (
              <li key={s.slug}>
                <Link
                  to="/c/$slug"
                  params={{ slug: s.slug }}
                  preload="intent"
                  className="group flex flex-col items-center rounded-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="block aspect-square w-full overflow-hidden rounded-[3px] bg-surface-muted ring-1 ring-border transition-all group-hover:ring-primary/40">
                    {s.image?.src ? (
                      <img src={s.image.src} alt={s.name} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-muted text-muted-foreground"><LayoutGrid className="h-5 w-5" /></span>
                    )}
                  </span>
                  <span className="mt-1 line-clamp-2 px-0.5 text-center text-[10px] font-medium leading-[1.2] text-foreground">{s.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <ul className="grid grid-cols-3 gap-x-1 gap-y-1.5">
      {Array.from({ length: 12 }).map((_, i) => (
        <li key={i} className="flex flex-col items-center gap-1">
          <span className="block aspect-square w-full animate-pulse rounded-[3px] bg-surface-muted" />
          <span className="h-2.5 w-3/4 animate-pulse rounded-[3px] bg-surface-muted" />
        </li>
      ))}
    </ul>
  );
}

function CompactEmpty({ name, slug }: { name: string; slug: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="relative mb-3 grid h-16 w-16 place-items-center">
        <div className="absolute inset-0 rounded-full bg-primary/10" />
        <div className="absolute inset-1.5 rounded-full bg-background shadow-inner ring-1 ring-primary/10" />
        <LayoutGrid className="relative h-7 w-7 text-primary" strokeWidth={1.75} />
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/70">
        Nothing here yet
      </p>
      <h3 className="mt-1 text-base font-semibold tracking-tight text-ink">
        No sub categories
      </h3>
      <p className="mx-auto mt-1 max-w-[220px] text-[11.5px] leading-relaxed text-muted-foreground">
        {name} has no sub categories yet. Browse the category directly or explore the full shop.
      </p>

      <Link
        to="/c/$slug"
        params={{ slug }}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[11.5px] font-semibold text-primary-foreground shadow-sm transition active:scale-[0.98]"
      >
        Shop {name}
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
      </Link>

      <div className="mt-3 flex items-center gap-2">
        <QuickChip to="/" icon={<Home className="h-3 w-3" strokeWidth={2} />} label="Home" />
        <QuickChip to="/products" icon={<Search className="h-3 w-3" strokeWidth={2} />} label="Browse" />
      </div>
    </div>
  );
}

function QuickChip({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1.5 text-[10.5px] font-medium text-ink ring-1 ring-border/60 transition active:scale-[0.98]"
    >
      <span className="text-primary">{icon}</span>
      {label}
    </Link>
  );
}

