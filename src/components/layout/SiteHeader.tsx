import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, ShoppingBag, User, Heart, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useCart } from "@/lib/cart";

const QUICK = ["Rings", "Earrings", "Necklaces", "Bridal", "Under 2000 Tk"];

export function SiteHeader() {
  const [q, setQ] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { count: cartCount } = useCart();
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

      {/* Mobile expandable search — premium sheet */}
      {mobileOpen && (
        <div className="animate-in slide-in-from-top-1 fade-in duration-200 border-t border-border/70 bg-gradient-to-b from-background to-surface-muted/40 md:hidden">
          <form onSubmit={submit} role="search" className="container-page py-3">
            <div className="group relative flex items-center gap-2 rounded-full border border-primary/25 bg-background pl-4 pr-1.5 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(58,2,3,0.18)] focus-within:border-primary focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_28px_-10px_rgba(58,2,3,0.28)] transition-all">
              <Search className="h-4 w-4 shrink-0 text-primary/70" />
              <input
                ref={mobileInputRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search rings, necklaces, 22k gold…"
                aria-label="Search products"
                className="min-w-0 flex-1 bg-transparent px-1 py-1 text-[14px] outline-none placeholder:text-muted-foreground/60"
              />
              <button
                type="submit"
                className="inline-flex h-9 shrink-0 items-center rounded-full bg-primary px-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.98] transition"
              >
                Search
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">Popular</span>
              <div className="flex flex-1 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {QUICK.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => goTerm(t)}
                    className="shrink-0 rounded-full border border-border/80 bg-background/80 px-3 py-1 text-[12px] font-medium text-foreground/80 hover:border-primary/60 hover:bg-primary/[0.04] hover:text-primary transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </form>
        </div>
      )}


      {/* Desktop — premium pill search */}
      <div className="container-page hidden h-16 items-center gap-5 md:flex">
        <Link to="/" aria-label="Home" className="shrink-0">
          <Logo />
        </Link>
        <form onSubmit={submit} className="flex max-w-2xl flex-1 items-center" role="search">
          <div className="group relative flex w-full items-center gap-2 rounded-full border border-border bg-surface-muted/60 pl-4 pr-1.5 py-1.5 transition-all focus-within:border-primary focus-within:bg-background focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_28px_-14px_rgba(58,2,3,0.28)]">
            <Search className="h-4 w-4 shrink-0 text-primary/70" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for jewelry, collections and more"
              aria-label="Search products"
              className="min-w-0 flex-1 bg-transparent px-1 text-[13.5px] outline-none placeholder:text-muted-foreground/60"
            />
            <button
              type="submit"
              className="inline-flex h-9 shrink-0 items-center rounded-full bg-primary px-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.98] transition"
            >
              Search
            </button>
          </div>
        </form>
        <nav className="flex items-center gap-1" aria-label="Account">
          <Link
            to="/products"
            preload="intent"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 hover:bg-primary/[0.06] hover:text-primary transition-colors"
            aria-label="Wishlist"
          >
            <Heart className="h-4.5 w-4.5" />
          </Link>
          <Link
            to="/auth"
            preload="intent"
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-foreground/80 hover:bg-primary/[0.06] hover:text-primary transition-colors"
          >
            <User className="h-4 w-4" />
            <span>Account</span>
          </Link>
          <Link
            to="/cart"
            preload="intent"
            className="relative ml-1 inline-flex h-10 items-center gap-1.5 rounded-full bg-primary/[0.06] px-3.5 text-[13px] font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
            aria-label="Cart"
          >
            <ShoppingBag className="h-4 w-4" />
            <span>Cart</span>
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
                {cartCount}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
