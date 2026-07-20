import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, ShoppingBag, User, Heart, Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useCart } from "@/lib/cart";

const NAV = [
  { label: "Shop All", term: "" },
  { label: "New Arrivals", term: "new" },
  { label: "Best Sellers", term: "bestseller" },
  { label: "Rings", term: "Rings" },
  { label: "Earrings", term: "Earrings" },
  { label: "Necklaces", term: "Necklaces" },
  { label: "Bridal", term: "Bridal" },
  { label: "Gifting", term: "Gift" },
];

export function SiteHeader() {
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { count: cartCount } = useCart();

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = q.trim();
    setSearchOpen(false);
    setMenuOpen(false);
    navigate({ to: "/products", search: t ? { q: t } : {} });
  };

  const goTerm = (term: string) => {
    setSearchOpen(false);
    setMenuOpen(false);
    const t = term.trim();
    navigate({ to: "/products", search: t ? { q: t } : {} });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur-md">
      {/* Announcement bar */}
      <div className="bg-primary/[0.04] text-center">
        <p className="container-page py-2 text-[10.5px] font-medium uppercase tracking-[0.24em] text-primary/80">
          Complimentary shipping on orders over 3,000 Tk · Handcrafted in Bangladesh
        </p>
      </div>

      {/* ============ DESKTOP ============ */}
      <div className="hidden md:block">
        <div className="container-page relative grid h-24 grid-cols-3 items-center">
          {/* Left — search trigger */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setSearchOpen((s) => !s)}
              className="group inline-flex items-center gap-2.5 text-foreground/70 transition-colors hover:text-primary"
              aria-label="Toggle search"
            >
              <Search className="h-[18px] w-[18px] stroke-[1.5]" />
              <span className="text-[11px] font-medium uppercase tracking-[0.24em]">
                Search
              </span>
            </button>
          </div>

          {/* Center — wordmark */}
          <div className="flex justify-center">
            <Link to="/" aria-label="Zonash home" className="focus:outline-none">
              <Logo size={38} />
            </Link>
          </div>

          {/* Right — icons */}
          <nav className="flex items-center justify-end gap-6 text-foreground/80" aria-label="Account">
            <Link
              to="/auth"
              preload="intent"
              className="transition-colors hover:text-primary"
              aria-label="Account"
            >
              <User className="h-[19px] w-[19px] stroke-[1.4]" />
            </Link>
            <Link
              to="/products"
              preload="intent"
              className="transition-colors hover:text-primary"
              aria-label="Wishlist"
            >
              <Heart className="h-[19px] w-[19px] stroke-[1.4]" />
            </Link>
            <Link
              to="/cart"
              preload="intent"
              className="relative transition-colors hover:text-primary"
              aria-label="Cart"
            >
              <ShoppingBag className="h-[19px] w-[19px] stroke-[1.4]" />
              <span className="absolute -right-2 -top-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[9.5px] font-semibold text-primary-foreground ring-2 ring-background">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            </Link>
          </nav>
        </div>

        {/* Nav row */}
        <nav
          className="border-t border-border/50"
          aria-label="Primary"
        >
          <ul className="container-page flex items-center justify-center gap-10 py-4">
            {NAV.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => goTerm(item.term)}
                  className="group relative text-[11px] font-medium uppercase tracking-[0.22em] text-foreground/70 transition-colors hover:text-primary"
                  style={{ fontFamily: '"Inter", "Figtree", ui-sans-serif, system-ui, sans-serif' }}
                >
                  {item.label}
                  <span className="absolute -bottom-1 left-0 h-px w-0 bg-primary transition-all duration-300 group-hover:w-full" />
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Expandable search */}
        {searchOpen && (
          <div className="border-t border-border/60 bg-background">
            <form onSubmit={submit} role="search" className="container-page relative py-6">
              <div className="mx-auto flex max-w-3xl items-center gap-3 border-b border-foreground/20 pb-2 focus-within:border-primary">
                <Search className="h-5 w-5 shrink-0 text-primary/70" />
                <input
                  ref={inputRef}
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search for jewelry, collections and more…"
                  aria-label="Search products"
                  className="min-w-0 flex-1 bg-transparent py-2 text-lg tracking-wide outline-none placeholder:text-muted-foreground/60"
                  style={{ fontFamily: '"Bodoni Moda", "Cormorant Garamond", Georgia, serif' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen(false);
                    setQ("");
                  }}
                  className="text-muted-foreground transition-colors hover:text-primary"
                  aria-label="Close search"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center gap-x-5 gap-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground/70">
                  Popular
                </span>
                {["Engagement Rings", "Gold Bangles", "Diamond Earrings", "Bridal Sets", "Under 2000 Tk"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => goTerm(t)}
                    className="text-[12px] font-medium tracking-wide text-foreground/70 underline decoration-transparent underline-offset-4 transition-colors hover:text-primary hover:decoration-primary/60"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ============ MOBILE ============ */}
      <div className="md:hidden">
        <div className="container-page grid h-16 grid-cols-3 items-center">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMenuOpen((m) => !m)}
              aria-label="Menu"
              className="grid h-10 w-10 place-items-center text-foreground/80 hover:text-primary"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5 stroke-[1.4]" />}
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen((s) => !s)}
              aria-label="Search"
              className="grid h-10 w-10 place-items-center text-foreground/80 hover:text-primary"
            >
              <Search className="h-[18px] w-[18px] stroke-[1.5]" />
            </button>
          </div>

          <div className="flex justify-center">
            <Link to="/" aria-label="Zonash home">
              <Logo size={22} />
            </Link>
          </div>

          <div className="flex items-center justify-end gap-1">
            <Link
              to="/auth"
              aria-label="Account"
              className="grid h-10 w-10 place-items-center text-foreground/80 hover:text-primary"
            >
              <User className="h-[18px] w-[18px] stroke-[1.4]" />
            </Link>
            <Link
              to="/cart"
              aria-label="Cart"
              className="relative grid h-10 w-10 place-items-center text-foreground/80 hover:text-primary"
            >
              <ShoppingBag className="h-[18px] w-[18px] stroke-[1.4]" />
              {cartCount > 0 && (
                <span className="absolute right-1 top-1 grid h-[16px] min-w-[16px] place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground ring-2 ring-background">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {searchOpen && (
          <form onSubmit={submit} role="search" className="container-page border-t border-border/60 py-3">
            <div className="flex items-center gap-2 border-b border-foreground/20 pb-2 focus-within:border-primary">
              <Search className="h-4 w-4 shrink-0 text-primary/70" />
              <input
                ref={inputRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search jewelry, collections…"
                aria-label="Search products"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none placeholder:text-muted-foreground/60"
                style={{ fontFamily: '"Bodoni Moda", "Cormorant Garamond", Georgia, serif' }}
              />
            </div>
          </form>
        )}

        {menuOpen && (
          <nav className="border-t border-border/60 bg-background" aria-label="Primary">
            <ul className="container-page flex flex-col divide-y divide-border/50">
              {NAV.map((item) => (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => goTerm(item.term)}
                    className="w-full py-3.5 text-left text-[12px] font-medium uppercase tracking-[0.22em] text-foreground/80 transition-colors hover:text-primary"
                    style={{ fontFamily: '"Inter", "Figtree", ui-sans-serif, system-ui, sans-serif' }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </header>
  );
}
