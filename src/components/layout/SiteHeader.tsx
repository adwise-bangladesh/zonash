import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Search, ShoppingBag, User, Heart, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useCart } from "@/lib/cart";

const QUICK = ["Rings", "Earrings", "Necklaces", "Bridal", "Under 2000 Tk"];

export function SiteHeader() {
  const [q, setQ] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { count: cartCount } = useCart();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";
  const mobileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mobileOpen) mobileInputRef.current?.focus();
  }, [mobileOpen]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    setMobileOpen(false);
    navigate({ to: "/products", search: term ? { q: term } : {} });
  };

  const goTerm = (term: string) => {
    const t = term.trim();
    setMobileOpen(false);
    navigate({ to: "/products", search: t ? { q: t } : {} });
  };


  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      {/* Mobile */}
      <div className="container-page flex h-12 items-center gap-2 md:hidden">
        <Link to="/" aria-label="Home" className="shrink-0">
          <Logo />
        </Link>
        <div className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Search"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </button>
          <Link
            to="/cart"
            aria-label="Cart"
            className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted"
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Mobile expandable search */}
      {mobileOpen && (
        <div className="border-t border-border bg-background md:hidden">
          <form onSubmit={submit} role="search" className="container-page py-2.5">
            <div className="relative flex items-center rounded-xl border border-primary/40 bg-background p-1 shadow-sm focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
              <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={mobileInputRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search rings, necklaces, 22k gold…"
                aria-label="Search products"
                className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-[14px] outline-none placeholder:text-muted-foreground/70"
              />
              <button
                type="submit"
                className="inline-flex h-8 shrink-0 items-center rounded-lg bg-primary px-3.5 text-[12px] font-semibold uppercase tracking-wider text-primary-foreground hover:brightness-110"
              >
                Search
              </button>
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {QUICK.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => goTerm(t)}
                  className="shrink-0 rounded-full border border-border bg-surface-muted/60 px-3 py-1 text-[12px] font-medium text-foreground/80 hover:border-primary hover:bg-primary/[0.04] hover:text-primary"
                >
                  {t}
                </button>
              ))}
            </div>
          </form>
        </div>
      )}


      {/* Desktop */}
      <div className="container-page hidden h-14 items-center gap-4 md:flex">
        <Link to="/" aria-label="Home" className="shrink-0">
          <Logo />
        </Link>
        {!isHome && (
          <form onSubmit={submit} className="flex flex-1 items-center" role="search">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search for jewelry, collections and more"
                aria-label="Search products"
                className="h-9 w-full rounded-[3px] border border-border bg-surface-muted pl-9 pr-24 text-[13px] outline-none focus:border-primary focus:bg-background"
              />
              <button
                type="submit"
                className="absolute right-1 top-1/2 inline-flex h-7 -translate-y-1/2 items-center rounded-[3px] bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Search
              </button>
            </div>
          </form>
        )}
        {isHome && <div className="flex-1" />}
        <nav className="flex items-center gap-1" aria-label="Account">
          <Link
            to="/products"
            preload="intent"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[3px] text-foreground hover:bg-secondary"
            aria-label="Wishlist"
          >
            <Heart className="h-4 w-4" />
          </Link>
          <Link
            to="/auth"
            preload="intent"
            className="inline-flex h-9 items-center gap-1.5 rounded-[3px] px-2.5 text-[13px] font-medium text-foreground hover:bg-secondary"
          >
            <User className="h-4 w-4" />
            <span>Account</span>
          </Link>
          <Link
            to="/cart"
            preload="intent"
            className="relative inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-secondary px-2.5 text-[13px] font-medium text-foreground hover:bg-accent"
            aria-label="Cart"
          >
            <ShoppingBag className="h-4 w-4" />
            <span>Cart</span>
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {cartCount}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
