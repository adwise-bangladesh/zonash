import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft, Clock, ImageOff, Loader2, Search, TrendingUp, X } from "lucide-react";

import { listProducts } from "@/lib/woo.functions";
import { formatBDT } from "@/lib/format";
import { resolveCardPrices } from "@/lib/price-range";
import { buildResponsiveImage, onImageSrcSetError } from "@/lib/product-image";
import { MIN_CHARS, useSearchSuggest } from "@/components/layout/useSearchSuggest";
import {
  POPULAR_TERMS,
  TERM_MAX,
  loadRecent,
  sanitizeTerm,
  saveRecent,
  clearRecent,
} from "@/lib/recent-searches";

const SUGGEST_LIMIT = 10;

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>) =>
    z.object({ q: z.string().max(TERM_MAX).optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Search — Zonash Fine Jewelry" },
      {
        name: "description",
        content: "Search Zonash fine jewelry by name, SKU or category and add to cart instantly.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Search — Zonash Fine Jewelry" },
      { property: "og:description", content: "Find rings, necklaces, bangles and more at Zonash." },
    ],
  }),
  component: SearchPage,
});

type Row = {
  id: number;
  slug: string;
  name: string;
  sku: string;
  sell: string | number | null;
  regular: string | number | null;
  image: string | null;
};

function SearchPage() {
  const { q: initialQ } = Route.useSearch();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [q, setQ] = useState(initialQ ?? "");
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState(-1);

  const term = q.trim();
  const searching = term.length >= MIN_CHARS;
  const { items, loading, error, settled } = useSearchSuggest(q, true, SUGGEST_LIMIT);

  // Trending products render before the shopper types anything.
  const trending = useQuery({
    queryKey: ["products", "trending", 6],
    queryFn: () => listProducts({ data: { page: 1, perPage: 6, featured: true } }),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    setRecent(loadRecent());
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  // Reset the highlighted row whenever the visible result set changes.
  useEffect(() => setActive(-1), [term, items]);

  const trendingRows: Row[] = useMemo(() => {
    const products = trending.data?.products ?? [];
    return products.map((p) => {
      const { sell, regular } = resolveCardPrices(p);
      return {
        id: p.id,
        slug: String(p.slug ?? ""),
        name: String(p.name ?? ""),
        sku: String(p.sku ?? ""),
        sell: sell ?? null,
        regular: regular ?? null,
        image: p.images?.[0]?.src ?? null,
      };
    });
  }, [trending.data]);

  const rows: Row[] = searching ? items.map((p) => ({ ...p })) : trendingRows;

  const withImages = useMemo(
    () => rows.map((p) => ({ ...p, img: buildResponsiveImage(p.image, { sizes: "64px" }) })),
    [rows],
  );

  const submit = useCallback(
    (raw: string) => {
      const t = sanitizeTerm(raw);
      if (!t) return;
      setRecent(saveRecent(t));
      navigate({ to: "/products", search: { q: t } });
    },
    [navigate],
  );

  const openProduct = useCallback(
    (slug: string, name: string) => {
      setRecent(saveRecent(name));
      navigate({ to: "/products/$slug", params: { slug } });
    },
    [navigate],
  );

  const runTerm = useCallback((t: string) => {
    setQ(t);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (q) {
          setQ("");
          return;
        }
        window.history.length > 1 ? window.history.back() : navigate({ to: "/" });
        return;
      }
      if (withImages.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % withImages.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i <= 0 ? withImages.length - 1 : i - 1));
      } else if (e.key === "Enter" && active >= 0) {
        e.preventDefault();
        const hit = withImages[active];
        if (hit) openProduct(hit.slug, hit.name);
      }
    },
    [q, active, withImages, navigate, openProduct],
  );

  // Keep the highlighted row inside the viewport during keyboard navigation.
  useEffect(() => {
    if (active < 0) return;
    listRef.current
      ?.querySelector(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const listId = "search-results";

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Fixed search bar */}
      <div className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur-md">
        <div className="container-page flex items-center gap-2 py-2.5">
          <Link
            to="/"
            aria-label="Back to home"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-primary/[0.06] hover:text-primary"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </Link>
          <form
            role="search"
            className="min-w-0 flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              submit(q);
            }}
          >
            <div className="relative flex items-center rounded-full border border-border bg-surface-muted/60 pl-3.5 pr-1 transition-all focus-within:border-primary focus-within:bg-background focus-within:ring-1 focus-within:ring-primary/20">
              <Search className="h-4 w-4 shrink-0 text-primary/70" aria-hidden="true" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value.slice(0, TERM_MAX))}
                onKeyDown={onKeyDown}
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={TERM_MAX}
                aria-label="Search products"
                role="combobox"
                aria-expanded={withImages.length > 0}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                placeholder="Search rings, necklaces, 22k gold…"
                className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-[13.5px] outline-none placeholder:text-muted-foreground/60"
              />
              {loading && (
                <Loader2 className="mr-1 h-4 w-4 shrink-0 animate-spin text-primary/70" aria-hidden="true" />
              )}
              {q && !loading && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQ("");
                    inputRef.current?.focus();
                  }}
                  className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="submit"
                className="inline-flex h-8 shrink-0 items-center rounded-full bg-primary px-4 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-primary-foreground transition hover:brightness-110 active:scale-[0.98]"
              >
                Search
              </button>
            </div>
          </form>
        </div>
      </div>

      <main className="container-page flex-1 pb-16 pt-3">
        <h1 className="sr-only">Search Zonash fine jewelry</h1>
        <span aria-live="polite" className="sr-only">
          {searching
            ? loading
              ? "Searching products"
              : error
                ? error
                : `${withImages.length} result${withImages.length === 1 ? "" : "s"} for ${term}`
            : ""}
        </span>

        {/* Idle state — recent + popular */}
        {!searching && (
          <div className="space-y-5">
            {recent.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    Recent searches
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      clearRecent();
                      setRecent([]);
                    }}
                    className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary"
                  >
                    Clear
                  </button>
                </div>
                <ul className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/70">
                  {recent.map((r) => (
                    <li key={r}>
                      <button
                        type="button"
                        onClick={() => runTerm(r)}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] text-foreground/85 transition-colors hover:bg-primary/[0.04]"
                      >
                        <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                        <span className="truncate">{r}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                Popular
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_TERMS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => runTerm(t)}
                    className="rounded-full border border-border/80 bg-background px-3 py-1.5 text-[12px] font-medium text-foreground/80 transition-colors hover:border-primary/60 hover:bg-primary/[0.04] hover:text-primary"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Trending heading when idle */}
        {!searching && (
          <h2 className="mb-2 mt-6 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            <TrendingUp className="h-3 w-3" aria-hidden="true" />
            Trending now
          </h2>
        )}

        {/* Result / trending list */}
        {((searching && withImages.length > 0) || (!searching && withImages.length > 0)) && (
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label={searching ? "Search results" : "Trending products"}
            className="overflow-hidden rounded-2xl border border-border/70"
          >
            {withImages.map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-${i}`}
                data-idx={i}
                role="option"
                aria-selected={i === active}
                className="border-b border-border/50 last:border-b-0"
              >
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => openProduct(p.slug, p.name)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    i === active ? "bg-primary/[0.06]" : "hover:bg-primary/[0.04]"
                  }`}
                >
                  <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-muted">
                    {p.img ? (
                      <img
                        src={p.img.src}
                        srcSet={p.img.srcSet || undefined}
                        sizes={p.img.srcSet ? p.img.sizes : undefined}
                        onError={onImageSrcSetError}
                        alt={p.name}
                        width={56}
                        height={56}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageOff className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[13px] font-medium text-foreground">{p.name}</span>
                    {p.sku && (
                      <span className="mt-0.5 block truncate text-[10.5px] uppercase tracking-wide text-muted-foreground">
                        {p.sku}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[13px] font-bold text-primary">
                      {formatBDT(p.sell ?? undefined)}
                    </span>
                    {p.regular != null && (
                      <span className="block text-[10.5px] text-muted-foreground line-through">
                        {formatBDT(p.regular)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Loading skeleton */}
        {((searching && loading && withImages.length === 0) ||
          (!searching && trending.isLoading)) && (
          <div aria-hidden="true" className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/70">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <div className="h-14 w-14 shrink-0 animate-pulse rounded-lg bg-surface-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-4/5 animate-pulse rounded bg-surface-muted" />
                  <div className="h-2.5 w-1/4 animate-pulse rounded bg-surface-muted" />
                </div>
                <div className="h-3 w-12 animate-pulse rounded bg-surface-muted" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {searching && !loading && error && (
          <div className="rounded-2xl border border-border/70 px-4 py-6 text-center">
            <p className="text-[13px] text-muted-foreground">{error}</p>
            <button
              type="button"
              onClick={() => runTerm(`${term} `)}
              className="mt-3 rounded-full border border-border px-4 py-1.5 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/[0.06]"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty */}
        {searching && !loading && !error && settled && withImages.length === 0 && (
          <div className="rounded-2xl border border-border/70 px-4 py-8 text-center">
            <p className="text-[13.5px] font-medium text-foreground">No products found for “{term}”.</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Try a shorter term, a different spelling, or browse the full shop.
            </p>
            <Link
              to="/products"
              className="mt-4 inline-flex rounded-full bg-primary px-5 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-primary-foreground transition hover:brightness-110"
            >
              Browse all products
            </Link>
          </div>
        )}

        {/* See all */}
        {searching && withImages.length > 0 && (
          <button
            type="button"
            onClick={() => submit(term)}
            className="mt-3 w-full rounded-full border border-border/70 bg-surface-muted/40 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-primary transition-colors hover:bg-primary/[0.06]"
          >
            See all results for “{term}”
          </button>
        )}
      </main>
    </div>
  );
}
