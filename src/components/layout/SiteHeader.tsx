import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, ShoppingBag, User, Heart, X, Camera, Clock } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useCart } from "@/lib/cart";

const POPULAR = [
  "Engagement Rings",
  "Gold Bangles",
  "Earrings",
  "Bridal Sets",
  "Necklaces",
  "Under 2000 Tk",
  "Gift Items",
];

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (term: string) => {
    const t = term.trim();
    if (t) saveRecent(t);
    setRecent(loadRecent());
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
            aria-label="Search"
            onClick={() => setOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-primary/[0.06] hover:text-primary md:h-10 md:w-10"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
          <Link
            to="/products"
            aria-label="Wishlist"
            className="grid h-9 w-9 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-primary/[0.06] hover:text-primary md:h-10 md:w-10"
          >
            <Heart className="h-[18px] w-[18px]" />
          </Link>
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

      {/* Search overlay — identical section design to home page */}
      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close search"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/30 backdrop-blur-sm animate-in fade-in duration-150"
          />
          <div className="relative mx-auto w-full max-w-2xl px-4 pt-4 animate-in slide-in-from-top-4 fade-in duration-200">
            <div className="rounded-2xl border border-border bg-background p-4 shadow-[0_20px_60px_-20px_rgba(15,15,15,0.35)]">
              <form
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  go(q);
                }}
              >
                <div className="relative flex items-center rounded-2xl border border-border bg-background p-1.5 transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
                  <div className="pl-3 text-muted-foreground">
                    <Search className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <input
                    ref={inputRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    type="search"
                    aria-label="Search products"
                    placeholder="Search for rings, necklaces, 22k gold…"
                    className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-muted-foreground/70"
                  />
                  <div className="flex shrink-0 items-center gap-1 pr-1">
                    <button
                      type="button"
                      aria-label="Visual search"
                      className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
                    >
                      <Camera className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label="Close"
                      className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary md:hidden"
                    >
                      <X className="h-5 w-5" />
                    </button>
                    <button
                      type="submit"
                      className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[12px] font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:brightness-110 active:scale-[0.98]"
                    >
                      Search
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-primary">
                    Popular Collections
                  </span>
                  <Link
                    to="/categories"
                    onClick={() => setOpen(false)}
                    className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary"
                  >
                    View All
                  </Link>
                </div>

                <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {POPULAR.map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => go(label)}
                      className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface-muted/60 px-4 py-2 text-[13px] font-medium text-foreground/80 transition-all hover:border-primary hover:bg-primary/[0.04] hover:text-primary"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/30 transition-colors group-hover:bg-primary" />
                      {label}
                    </button>
                  ))}
                </div>

                {recent.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      Recent
                    </span>
                    {recent.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => go(r)}
                        className="text-[12px] font-medium text-foreground/70 underline decoration-border underline-offset-4 transition-colors hover:text-primary hover:decoration-primary/60"
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
