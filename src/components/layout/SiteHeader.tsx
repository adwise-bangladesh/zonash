import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, ShoppingBag, User, X, Clock } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useCart } from "@/lib/cart";

const POPULAR = ["Rings", "Earrings", "Necklaces", "Bridal", "Bangles", "Under 2000 Tk"];
const RECENT_KEY = "zonash.recent-searches";

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, 4) : [];
  } catch {
    return [];
  }
}

function saveRecent(term: string) {
  if (typeof window === "undefined") return;
  const t = term.trim();
  if (!t) return;
  const cur = loadRecent().filter((x) => x.toLowerCase() !== t.toLowerCase());
  cur.unshift(t);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 4)));
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { count: cartCount } = useCart();

  useEffect(() => {
    if (open) {
      setRecent(loadRecent());
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const go = (term: string) => {
    const t = term.trim();
    if (t) saveRecent(t);
    setOpen(false);
    setQ("");
    navigate({ to: "/products", search: t ? { q: t } : {} });
  };

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
            onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-primary/[0.06] hover:text-primary md:h-10 md:w-10"
          >
            {open ? <X className="h-[18px] w-[18px]" /> : <Search className="h-[18px] w-[18px]" />}
          </button>
          <Link
            to="/auth"
            aria-label="Account"
            className="hidden h-10 w-10 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-primary/[0.06] hover:text-primary md:grid"
          >
            <User className="h-[18px] w-[18px]" />
          </Link>
          <Link
            to="/cart"
            aria-label="Cart"
            className="relative grid h-9 w-9 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-primary/[0.06] hover:text-primary md:h-10 md:w-10"
          >
            <ShoppingBag className="h-[18px] w-[18px]" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Inline expandable search — compact */}
      {open && (
        <div className="border-t border-border/70 bg-background animate-in slide-in-from-top-2 fade-in duration-150">
          <div className="container-page py-2.5">
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                go(q);
              }}
            >
              <div className="relative flex items-center rounded-full border border-border bg-surface-muted/60 pl-3.5 pr-1 transition-all focus-within:border-primary focus-within:bg-background focus-within:ring-1 focus-within:ring-primary/20">
                <Search className="h-4 w-4 shrink-0 text-primary/70" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  type="search"
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
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                  Popular
                </span>
                <div className="flex flex-1 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                    <Clock className="h-3 w-3" />
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
