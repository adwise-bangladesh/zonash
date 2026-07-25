import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, ShoppingBag, X, Clock, Loader2, ImageOff } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useCart } from "@/lib/cart";
import { formatBDT } from "@/lib/format";
import { buildResponsiveImage, onImageSrcSetError } from "@/lib/product-image";
import { MIN_CHARS, useSearchSuggest } from "./useSearchSuggest";

const POPULAR = ["Rings", "Earrings", "Necklaces", "Bridal", "Bangles", "Under 2000 Tk"] as const;
const RECENT_KEY = "zonash.recent-searches";
const RECENT_MAX = 4;
/** Upper bound for a search term — matches the server-side query validators. */
const TERM_MAX = 120;


/**
 * Normalises raw input before it ever reaches the URL or localStorage:
 * strips control characters, collapses whitespace and clamps the length.
 */
function sanitizeTerm(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TERM_MAX);
}

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is string => typeof x === "string")
      .map(sanitizeTerm)
      .filter(Boolean)
      .slice(0, RECENT_MAX);
  } catch {
    // Corrupt JSON, disabled storage or Safari private mode — recents are
    // a convenience, never a hard dependency.
    return [];
  }
}

function saveRecent(term: string) {
  if (typeof window === "undefined") return;
  const t = sanitizeTerm(term);
  if (!t) return;
  try {
    const next = [t, ...loadRecent().filter((x) => x.toLowerCase() !== t.toLowerCase())];
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, RECENT_MAX)));
  } catch {
    // Quota exceeded / storage blocked — silently skip persisting.
  }
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { count: cartCount } = useCart();
  const panelId = useId();
  const listId = `${panelId}-list`;

  const term = q.trim();
  const { items, loading, error, settled } = useSearchSuggest(q, open);
  const showList = open && term.length >= MIN_CHARS;

  useEffect(() => {
    if (!open) return;
    setRecent(loadRecent());
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Reset the highlighted row whenever the result set changes.
  useEffect(() => setActive(-1), [term, items]);

  // Escape closes the panel from anywhere inside it (input, chips, submit).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Outside click / tap closes the panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setActive(-1);
  }, []);

  const go = useCallback(
    (raw: string) => {
      const t = sanitizeTerm(raw);
      if (t) saveRecent(t);
      close();
      navigate({ to: "/products", search: t ? { q: t } : {} });
    },
    [close, navigate],
  );

  const openProduct = useCallback(
    (slug: string, name: string) => {
      saveRecent(name);
      close();
      navigate({ to: "/products/$slug", params: { slug } });
    },
    [close, navigate],
  );

  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showList || items.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
      } else if (e.key === "Enter" && active >= 0) {
        e.preventDefault();
        const hit = items[active];
        if (hit) openProduct(hit.slug, hit.name);
      }
    },
    [showList, items, active, openProduct],
  );

  const rows = useMemo(
    () =>
      items.map((p) => ({
        ...p,
        img: buildResponsiveImage(p.image, { sizes: "48px" }),
      })),
    [items],
  );



  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="container-page flex h-14 items-center justify-between gap-3 md:h-16">
        <Link to="/" aria-label="Home" className="shrink-0">
          <Logo size={26} />
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={open ? "Close search" : "Search"}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-primary/[0.06] hover:text-primary md:h-10 md:w-10"
          >
            {open ? <X className="h-[18px] w-[18px]" /> : <Search className="h-[18px] w-[18px]" />}
          </button>
          {/* Account entry point intentionally omitted from the storefront
              header — customers reach their orders through the checkout /
              order-lookup flow instead. */}

          <Link
            to="/cart"
            aria-label={cartCount > 0 ? `Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}` : "Cart"}
            className="relative grid h-9 w-9 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-primary/[0.06] hover:text-primary md:h-10 md:w-10"
          >
            <ShoppingBag className="h-[18px] w-[18px]" />
            {cartCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background"
              >
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Inline expandable search — compact */}
      {open && (
        <div
          id={panelId}
          className="border-t border-border/70 bg-background animate-in slide-in-from-top-2 fade-in duration-150"
        >
          <div className="container-page py-2.5">
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                go(q);
              }}
            >
              <div className="relative flex items-center rounded-full border border-border bg-surface-muted/60 pl-3.5 pr-1 transition-all focus-within:border-primary focus-within:bg-background focus-within:ring-1 focus-within:ring-primary/20">
                <Search className="h-4 w-4 shrink-0 text-primary/70" aria-hidden="true" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value.slice(0, TERM_MAX))}
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={TERM_MAX}
                  aria-label="Search products"
                  placeholder="Search rings, necklaces, 22k gold…"
                  className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-[13.5px] outline-none placeholder:text-muted-foreground/60"
                />
                <button
                  type="submit"
                  className="inline-flex h-8 shrink-0 items-center rounded-full bg-primary px-4 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-primary-foreground transition hover:brightness-110 active:scale-[0.98]"
                >
                  Search
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <span
                  id={`${panelId}-popular`}
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70"
                >
                  Popular
                </span>
                <div
                  role="group"
                  aria-labelledby={`${panelId}-popular`}
                  className="flex flex-1 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {POPULAR.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => go(t)}
                      className="shrink-0 rounded-full border border-border/80 bg-background px-3 py-1 text-[11.5px] font-medium text-foreground/80 transition-colors hover:border-primary/60 hover:bg-primary/[0.04] hover:text-primary"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {recent.length > 0 && (
                <div
                  role="group"
                  aria-labelledby={`${panelId}-recent`}
                  className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1"
                >
                  <span
                    id={`${panelId}-recent`}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70"
                  >
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    Recent
                  </span>
                  {recent.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => go(r)}
                      className="text-[11.5px] font-medium text-foreground/70 underline decoration-border underline-offset-4 transition-colors hover:text-primary hover:decoration-primary/60"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
