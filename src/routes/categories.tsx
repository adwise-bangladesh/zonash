import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { z } from "zod";
import { LayoutGrid, ArrowRight, Home, Search } from "lucide-react";
import { listPrimaryCategories, getCategoryWithSubs } from "@/lib/woo.functions";
import { CheckoutHeader } from "@/components/layout/CheckoutHeader";
import { NotFoundView } from "@/components/NotFoundView";
import { buildThumbImage } from "@/lib/product-image";

const SLUG_RE = /^[a-z0-9-]+$/;

const searchSchema = z.object({
  parent: z.string().min(1).max(96).regex(SLUG_RE).optional().catch(undefined),
});

/** Categories rarely change — keep them fresh for 5 min to avoid refetch on every mount. */
const categoriesQuery = queryOptions({
  queryKey: ["categories", "primary"],
  queryFn: () => listPrimaryCategories(),
  staleTime: 300_000,
  gcTime: 1_800_000,
});

const subsQuery = (slug: string) =>
  queryOptions({
    queryKey: ["categories", "subs", slug],
    queryFn: () => getCategoryWithSubs({ data: { slug } }),
    staleTime: 300_000,
    gcTime: 1_800_000,
    retry: 1,
  });

/** Defensive: never trust the shape of an upstream WooCommerce payload. */
type SafeCategory = { slug: string; name: string; imageSrc: string | null; hasSubs: boolean };

function normalizeCategories(input: unknown): SafeCategory[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: SafeCategory[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as {
      slug?: unknown;
      name?: unknown;
      has_subs?: unknown;
      image?: { src?: unknown } | null;
    };
    const slug = typeof c.slug === "string" ? c.slug.trim() : "";
    if (!slug || !SLUG_RE.test(slug) || seen.has(slug)) continue;
    const name = typeof c.name === "string" && c.name.trim() ? c.name.trim() : slug;
    const src = c.image && typeof c.image === "object" && typeof c.image.src === "string" ? c.image.src : "";
    seen.add(slug);
    out.push({
      slug,
      name,
      imageSrc: src.startsWith("https://") ? src : null,
      // Absent on sub-category payloads; only the rail reads it.
      hasSubs: c.has_subs === true,
    });
  }
  return out;
}


export const Route = createFileRoute("/categories")({
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => ({ parent: search.parent }),
  // Warm BOTH panes on the server so a deep link (?parent=slug) ships real
  // sub-category markup in the SSR HTML. On the client the sub fetch is fired
  // but NOT awaited, so switching rail tabs paints instantly instead of
  // blocking navigation on a round trip.
  loader: async ({ context, deps }) => {
    const primary = await context.queryClient.ensureQueryData(categoriesQuery);
    const list = normalizeCategories(primary?.categories);
    // Only branching parents have a right pane worth warming.
    const first = (list.find((c) => c.hasSubs) ?? list[0])?.slug;
    const slug = deps.parent ?? first;
    if (slug) {
      const warm = context.queryClient
        .ensureQueryData(subsQuery(slug))
        .catch(() => undefined);
      if (typeof document === "undefined") await warm;
    }
    // Return nothing: the component reads via useSuspenseQuery, so returning
    // the payload here would serialize the whole category list a SECOND time
    // into the SSR HTML (router match dehydration + query dehydration).
  },


  head: () => ({
    meta: [
      { title: "Shop by category — Zonash" },
      { name: "description", content: "Browse every jewelry category at Zonash." },
      { property: "og:title", content: "Shop by category — Zonash" },
      { property: "og:description", content: "Explore rings, chains, earrings and more." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://zonash.lovable.app/categories" }],
  }),
  component: CategoriesPage,
  pendingComponent: PagePending,
  errorComponent: PageError,
  notFoundComponent: () => (
    <PageShell>
      <NotFoundView bare variant="not-found" primaryLabel="Browse all products" primaryTo="/products" />
    </PageShell>
  ),
});

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <CheckoutHeader title="Categories" />
      <main className="flex flex-1 items-start justify-center">{children}</main>
    </div>
  );
}

function PagePending() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <CheckoutHeader title="Categories" />
      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="grid h-[calc(100dvh-44px)] w-full grid-cols-[76px_minmax(0,1fr)] overflow-hidden md:h-[calc(100dvh-56px)]">
          <aside className="border-r border-border bg-surface-muted">
            <ul className="pb-24">
              {Array.from({ length: 8 }).map((_, i) => (
                <li key={i} className="flex flex-col items-center gap-1 px-1 py-2">
                  <span className="block h-10 w-10 animate-pulse rounded-[3px] bg-muted" />
                  <span className="block h-2 w-10 animate-pulse rounded-[3px] bg-muted" />
                </li>
              ))}
            </ul>
          </aside>
          <section className="min-h-0">
            {/* Mirror the loaded pane exactly (sticky title bar + px-2 pt-2) so
                the skeleton→content swap shifts nothing. */}
            <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
              <span className="block h-4 w-24 animate-pulse rounded bg-muted" />
              <span className="block h-[19px] w-14 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="px-2 pt-2">
              <GridSkeleton />
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}

function PageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <PageShell>
      <NotFoundView
        bare
        variant="error"
        title="Categories didn't load"
        description="Something went wrong while loading the category list. Please try again."
        onRetry={reset}
      />
    </PageShell>
  );
}

function CategoriesPage() {
  const { parent } = Route.useSearch();
  const navigate = useNavigate({ from: "/categories" });
  const queryClient = useQueryClient();
  const { data, refetch, isFetching } = useSuspenseQuery(categoriesQuery);

  const cats = React.useMemo(() => normalizeCategories(data?.categories), [data?.categories]);
  const upstreamError = typeof data?.error === "string" ? data.error : null;

  const railRef = React.useRef<HTMLUListElement>(null);
  const didScrollRef = React.useRef(false);
  const activeSlug = parent ?? cats.find((c) => c.hasSubs)?.slug ?? cats[0]?.slug;

  // Keep the active rail item visible; skip animation on first paint.
  React.useEffect(() => {
    const rail = railRef.current;
    if (!rail || !activeSlug) return;
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(activeSlug) : activeSlug;
    const el = rail.querySelector<HTMLElement>(`[data-slug="${escaped}"]`);
    el?.scrollIntoView({
      behavior: didScrollRef.current ? "smooth" : "auto",
      // Vertical rail: never pass `inline`, it can scroll the whole document
      // sideways on first paint.
      block: "nearest",
    });
    didScrollRef.current = true;
  }, [activeSlug]);

  const selectCategory = React.useCallback(
    (slug: string) => {
      if (slug === activeSlug) return;
      const target = cats.find((c) => c.slug === slug);
      if (target && !target.hasSubs) {
        void navigate({ to: "/c/$slug", params: { slug } });
        return;
      }
      void navigate({ search: { parent: slug }, replace: true });
    },
    [activeSlug, cats, navigate],
  );

  // Warm the sub-category cache on hover/focus — served from cache on click.
  // Throttled + de-duped: sweeping the mouse down the rail must not fire one
  // server call per item (that multiplies origin load by ~N per visitor), and
  // anything already cached/fresh is skipped entirely.
  const prefetchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetched = React.useRef<Set<string>>(new Set());
  React.useEffect(
    () => () => {
      if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    },
    [],
  );

  const prefetchSubs = React.useCallback(
    (slug: string) => {
      if (prefetched.current.has(slug)) return;
      if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
      prefetchTimer.current = setTimeout(() => {
        prefetchTimer.current = null;
        if (prefetched.current.has(slug)) return;
        const opts = subsQuery(slug);
        if (queryClient.getQueryState(opts.queryKey)?.data) {
          prefetched.current.add(slug);
          return;
        }
        // Bound the de-dupe set so a long session can't grow it without limit.
        if (prefetched.current.size > 64) prefetched.current.clear();
        prefetched.current.add(slug);
        void queryClient.prefetchQuery(opts).catch(() => {
          prefetched.current.delete(slug);
        });
      }, 140);
    },
    [queryClient],
  );

  const onRailKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLUListElement>) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const idx = cats.findIndex((c) => c.slug === activeSlug);
      if (idx < 0) return;
      const next = cats[e.key === "ArrowDown" ? idx + 1 : idx - 1];
      if (!next) return;
      e.preventDefault();
      selectCategory(next.slug);
      railRef.current
        ?.querySelector<HTMLElement>(
          `[data-slug="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(next.slug) : next.slug}"] button`,
        )
        ?.focus();
    },
    [activeSlug, cats, selectCategory],
  );

  if (!cats.length) {
    return (
      <PageShell>
        {upstreamError ? (
          <NotFoundView
            bare
            variant="error"
            title="Categories unavailable"
            description={upstreamError}
            onRetry={() => {
              if (!isFetching) void refetch();
            }}
          />
        ) : (
          <NotFoundView
            bare
            variant="empty"
            code="No categories"
            title="No categories with subcategories"
            description="Add subcategories in WooCommerce to see them here."
            primaryLabel="Continue shopping"
            primaryTo="/products"
            icon={LayoutGrid}
          />
        )}
      </PageShell>
    );
  }

  const parentMissing = !!parent && !cats.some((c) => c.slug === parent);
  const active = cats.find((c) => c.slug === activeSlug) ?? cats[0];

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <CheckoutHeader title="Categories" />
      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="grid h-[calc(100dvh-44px)] w-full grid-cols-[76px_minmax(0,1fr)] overflow-hidden md:h-[calc(100dvh-56px)]">
          {/* Left rail: main parent categories */}
          <aside className="border-r border-border bg-surface-muted">
            <nav
              aria-label="Parent categories"
              className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <ul ref={railRef} onKeyDown={onRailKeyDown} className="pb-24">
                {cats.map((c) => {
                  const isActive = !parentMissing && c.slug === active.slug;
                  const itemClass = `relative flex w-full flex-col items-center gap-1 px-1 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                    isActive ? "bg-background" : "text-foreground active:bg-background/60"
                  }`;
                  const inner = (
                    <>
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-1/2 h-7 w-[2px] -translate-y-1/2 rounded-r bg-primary"
                        />
                      )}
                      <span
                        className={`block h-10 w-10 shrink-0 overflow-hidden rounded-[3px] ring-1 ${
                          isActive ? "ring-primary/50" : "ring-border"
                        }`}
                      >
                        <CategoryThumb src={c.imageSrc} alt="" size={40} iconClass="h-4 w-4" />
                      </span>
                      <span
                        className={`block w-full truncate text-[10px] font-semibold leading-tight ${
                          isActive ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {c.name}
                      </span>
                    </>
                  );
                  return (
                    <li key={c.slug} data-slug={c.slug}>
                      {c.hasSubs ? (
                        <button
                          type="button"
                          onClick={() => selectCategory(c.slug)}
                          onPointerEnter={() => prefetchSubs(c.slug)}
                          onFocus={() => prefetchSubs(c.slug)}
                          aria-pressed={isActive}
                          aria-current={isActive ? "true" : undefined}
                          className={itemClass}
                        >
                          {inner}
                        </button>
                      ) : (
                        // Leaf category: there are no subcategories to browse, so
                        // the rail goes straight to its product page.
                        <Link
                          to="/c/$slug"
                          params={{ slug: c.slug }}
                          preload="intent"
                          className={itemClass}
                        >
                          {inner}
                        </Link>
                      )}
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
                description="That category doesn't exist anymore. Pick a category from the list or browse the full shop."
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

/**
 * Thumbnail that serves a WordPress generated crop sized for its slot (the
 * originals are multi-MB) and degrades to an icon when the upstream image 404s.
 */
const CategoryThumb = React.memo(function CategoryThumb({
  src,
  alt,
  size,
  iconClass,
  imgClass = "",
}: {
  src: string | null;
  alt: string;
  size: number;
  iconClass: string;
  imgClass?: string;
}) {
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [src]);

  const thumb = React.useMemo(() => buildThumbImage(src, size), [src, size]);

  if (!src || !thumb || broken) {
    return (
      <span className="grid h-full w-full place-items-center bg-muted text-muted-foreground">
        <LayoutGrid className={iconClass} aria-hidden="true" />
      </span>
    );
  }
  return (
    <img
      src={thumb.src}
      srcSet={thumb.srcSet || undefined}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={(e) => {
        // A missing generated crop falls back to the original once; a broken
        // original then shows the icon instead of an empty tile.
        const img = e.currentTarget;
        if (img.srcset || img.src !== src) {
          img.srcset = "";
          img.src = src;
          return;
        }
        setBroken(true);
      }}
      className={`h-full w-full object-cover ${imgClass}`}
    />
  );
});

const SubCategories = React.memo(function SubCategories({ slug, name }: { slug: string; name: string }) {
  const { data, isPending, isError, refetch, isFetching } = useQuery(subsQuery(slug));
  const subs = React.useMemo(() => normalizeCategories(data?.subs), [data?.subs]);
  const failed = isError || (!isPending && typeof data?.error === "string" && !!data.error);
  const retry = React.useCallback(() => {
    if (!isFetching) void refetch();
  }, [isFetching, refetch]);

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-2.5 py-1.5 backdrop-blur">
        <h2 className="min-w-0 truncate text-[12.5px] font-bold tracking-tight">{name}</h2>
        <Link
          to="/c/$slug"
          params={{ slug }}
          preload="intent"
          className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          View all
        </Link>
      </div>

      <div className="px-2 pt-2">
        {isPending ? (
          <GridSkeleton />
        ) : failed ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <h3 className="text-base font-semibold tracking-tight text-ink">Couldn't load sub categories</h3>
            <p className="mx-auto mt-1 max-w-[220px] text-[11.5px] leading-relaxed text-muted-foreground">
              Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={retry}
              disabled={isFetching}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[11.5px] font-semibold text-primary-foreground shadow-sm transition active:scale-[0.98] disabled:opacity-60"
            >
              {isFetching ? "Retrying…" : "Try again"}
            </button>
          </div>
        ) : subs.length === 0 ? (
          <CompactEmpty name={name} slug={slug} />
        ) : (
          <ul className="grid grid-cols-4 gap-2 px-0.5 pt-0.5">
            {subs.map((s) => (
              <li key={s.slug}>
                <Link
                  to="/c/$slug"
                  params={{ slug: s.slug }}
                  preload="intent"
                  className="group flex flex-col items-center gap-1.5 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="block aspect-square w-full overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/60 transition-shadow group-hover:shadow-md">
                    <CategoryThumb
                      src={s.imageSrc}
                      alt={s.name}
                      size={160}
                      iconClass="h-5 w-5"
                      imgClass="transition-transform duration-300 group-hover:scale-105"
                    />
                  </span>
                  <span className="line-clamp-2 text-center text-[10.5px] font-medium leading-tight text-ink">
                    {s.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
});

function GridSkeleton() {
  return (
    <ul className="grid grid-cols-4 gap-2 px-0.5 pt-0.5" aria-hidden="true">
      {Array.from({ length: 12 }).map((_, i) => (
        <li key={i} className="flex flex-col items-center gap-1.5">
          <span className="block aspect-square w-full animate-pulse rounded-2xl bg-surface-muted" />
          <span className="h-2.5 w-3/4 animate-pulse rounded-full bg-surface-muted" />
        </li>

      ))}
    </ul>
  );
}

function CompactEmpty({ name, slug }: { name: string; slug: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="relative mb-3 grid h-16 w-16 place-items-center">
        <div aria-hidden="true" className="absolute inset-0 rounded-full bg-primary/10" />
        <div aria-hidden="true" className="absolute inset-1.5 rounded-full bg-background shadow-inner ring-1 ring-primary/10" />
        <LayoutGrid className="relative h-7 w-7 text-primary" strokeWidth={1.75} aria-hidden="true" />
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/70">Nothing here yet</p>
      <h3 className="mt-1 text-base font-semibold tracking-tight text-ink">No sub categories</h3>
      <p className="mx-auto mt-1 max-w-[220px] text-[11.5px] leading-relaxed text-muted-foreground">
        {name} has no sub categories yet. Browse the category directly or explore the full shop.
      </p>

      <Link
        to="/c/$slug"
        params={{ slug }}
        preload="intent"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[11.5px] font-semibold text-primary-foreground shadow-sm transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Shop {name}
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
      </Link>

      <div className="mt-3 flex items-center gap-2">
        <QuickChip to="/" icon={<Home className="h-3 w-3" strokeWidth={2} aria-hidden="true" />} label="Home" />
        <QuickChip to="/products" icon={<Search className="h-3 w-3" strokeWidth={2} aria-hidden="true" />} label="Browse" />
      </div>
    </div>
  );
}

function QuickChip({ to, icon, label }: { to: "/" | "/products"; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      preload="intent"
      className="inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1.5 text-[10.5px] font-medium text-ink ring-1 ring-border/60 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="text-primary">{icon}</span>
      {label}
    </Link>
  );
}
